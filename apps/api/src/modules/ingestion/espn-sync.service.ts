import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { ProviderRegistry } from '../../providers/providers.module';
import type { EspnMapped } from '../../providers/espn/espn.mappers';
import { EntityResolverService, newResolveCache, type ResolveCache } from '../normalization/entity-resolver.service';
import { IngestionService } from './ingestion.service';

const DAY = 86_400_000;

export interface EspnCounters {
  requests: number;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  odds: number;
  standings: number;
  errors: string[];
  pending: string[];
  /** Partidos creados o actualizados en esta corrida (para publicar en vivo). */
  touched: string[];
}

const counters = (): EspnCounters => ({ requests: 0, fetched: 0, created: 0, updated: 0, unchanged: 0, odds: 0, standings: 0, errors: [], pending: [], touched: [] });

/** Meses (UTC) que cubren el intervalo [from, to]. */
export function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d.getTime() <= to.getTime()) {
    out.push(d);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
}

/**
 * Sincronización con ESPN: histórico (años completos, reanudable), ventana
 * rodante (semana pasada, actual y siguientes) y marcadores del día. Los
 * partidos ya mapeados se comparan en memoria y solo se escriben si cambian,
 * así una pasada completa por 20 ligas cuesta pocas consultas.
 */
@Injectable()
export class EspnSyncService {
  private readonly logger = new Logger(EspnSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly resolver: EntityResolverService,
    private readonly ingestion: IngestionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  get leagues(): string[] {
    return this.providers.espn.leagues;
  }

  /** Ingesta por lotes: partidos mapeados se actualizan solo si cambian; los nuevos pasan por el resolutor completo. */
  async ingest(m: EspnMapped, c: EspnCounters, cache: ResolveCache, withOdds = true): Promise<void> {
    c.fetched += m.fixtures.length;
    const ids = [...new Set(m.fixtures.map((f) => f.ref.externalId))];
    const maps = ids.length
      ? await this.prisma.providerEntityMap.findMany({ where: { provider: 'ESPN', entityType: 'FIXTURE', externalId: { in: ids } }, select: { externalId: true, internalId: true } })
      : [];
    const byExt = new Map(maps.map((r) => [r.externalId, r.internalId]));
    const existing = maps.length ? await this.prisma.fixture.findMany({ where: { id: { in: maps.map((r) => r.internalId) } } }) : [];
    const byId = new Map(existing.map((f) => [f.id, f]));
    for (const f of m.fixtures) {
      const id = byExt.get(f.ref.externalId);
      const row = id ? byId.get(id) : undefined;
      if (id && row) {
        const data = this.resolver.fixtureChanges(row, f);
        if (Object.keys(data).length === 0) {
          c.unchanged += 1;
          continue;
        }
        await this.prisma.fixture.update({ where: { id }, data });
        c.updated += 1;
        c.touched.push(id);
        continue;
      }
      const r = await this.resolver.upsertFixture(f, cache);
      if (r.action === 'created') c.created += 1;
      else if (r.action === 'unchanged') c.unchanged += 1;
      else c.updated += 1;
      c.touched.push(r.id);
    }
    if (!withOdds) return;
    for (const e of m.odds) {
      const r = await this.ingestion.ingestOddsEvent(e);
      c.odds += r.created + r.updated;
    }
  }

  private async leagueId(slug: string): Promise<string | null> {
    return this.resolver.findMapped('ESPN', 'LEAGUE', slug);
  }

  /**
   * Histórico: años completos por liga, de `ESPN_HISTORY_YEARS` atrás hasta el
   * siguiente. Un año pasado ya cargado se salta, así que el job se reanuda
   * donde quedó si se corta por tiempo.
   */
  async backfill(deadline: number): Promise<EspnCounters> {
    const c = counters();
    const year = new Date().getUTCFullYear();
    const years: number[] = [];
    for (let y = year - this.env.ESPN_HISTORY_YEARS; y <= year + 1; y++) years.push(y);
    for (const slug of this.leagues) {
      const cache = newResolveCache();
      for (const y of years) {
        if (Date.now() > deadline) {
          c.pending.push(`${slug}:${y}`);
          continue;
        }
        const leagueId = await this.leagueId(slug);
        if (leagueId) {
          // Año pasado o siguiente: basta con que haya partidos. Año en curso: partidos anteriores a la
          // ventana rodante (la ventana mantiene el resto al día).
          const windowFrom = new Date(Date.now() - this.env.ESPN_WINDOW_PAST_DAYS * DAY);
          const end = y === year ? windowFrom : new Date(Date.UTC(y + 1, 0, 1));
          const loaded = await this.prisma.fixture.count({ where: { leagueId, primaryProvider: 'ESPN', kickoff: { gte: new Date(Date.UTC(y, 0, 1)), lt: end } } });
          if (loaded > 0) continue;
        }
        try {
          c.requests += 1;
          // El histórico no ingiere cuotas: las de partidos pasados no sirven y las futuras las trae la ventana.
          await this.ingest(await this.providers.espn.season(slug, y), c, cache, false);
        } catch (e) {
          c.errors.push(`${slug}:${y}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
    }
    c.touched = [];
    return c;
  }

  /** Ventana rodante: meses que cubren [hoy − pasado, hoy + futuro] y clasificación de cada liga. */
  async syncWindow(deadline: number): Promise<EspnCounters> {
    const c = counters();
    const now = Date.now();
    const from = new Date(now - this.env.ESPN_WINDOW_PAST_DAYS * DAY);
    const to = new Date(now + this.env.ESPN_WINDOW_FUTURE_DAYS * DAY);
    const months = monthsBetween(from, to);
    for (const slug of this.leagues) {
      const cache = newResolveCache();
      if (Date.now() > deadline) {
        c.pending.push(slug);
        continue;
      }
      for (const month of months) {
        try {
          c.requests += 1;
          const m = await this.providers.espn.month(slug, month);
          // Solo los partidos de la ventana: el resto del mes ya lo cubre el histórico.
          const inWindow = m.fixtures.filter((f) => f.kickoff >= from && f.kickoff <= to);
          await this.ingest({ fixtures: inWindow, odds: m.odds }, c, cache);
        } catch (e) {
          c.errors.push(`${slug}:${month.toISOString().slice(0, 7)}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      try {
        if (await this.leagueId(slug)) {
          c.requests += 1;
          c.standings += await this.ingestion.ingestStandings(await this.providers.espn.standings(slug));
        }
      } catch (e) {
        c.errors.push(`${slug}:standings: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    c.touched = [];
    return c;
  }

  /** Marcadores del día: solo ligas con partidos en curso o por empezar (o recién iniciados sin cerrar). */
  async syncLive(): Promise<EspnCounters> {
    const c = counters();
    const now = Date.now();
    const active = await this.prisma.fixture.findMany({
      where: {
        primaryProvider: 'ESPN',
        OR: [{ status: { in: ['LIVE', 'SUSPENDED'] } }, { status: 'SCHEDULED', kickoff: { gte: new Date(now - 3 * DAY), lte: new Date(now + 30 * 60_000) } }],
      },
      select: { kickoff: true, league: { select: { id: true } } },
    });
    if (active.length === 0) return c;
    const leagueIds = [...new Set(active.map((f) => f.league.id))];
    const maps = await this.prisma.providerEntityMap.findMany({ where: { provider: 'ESPN', entityType: 'LEAGUE', internalId: { in: leagueIds } }, select: { externalId: true, internalId: true } });
    // Días UTC a consultar: los de los partidos pendientes (ESPN agrupa por fecha local de EE. UU., se incluye la víspera).
    const days = new Set<string>();
    for (const f of active) {
      for (const offset of [-DAY, 0]) days.add(new Date(Math.min(f.kickoff.getTime(), now) + offset).toISOString().slice(0, 10));
    }
    for (const { externalId: slug } of maps) {
      const cache = newResolveCache();
      for (const d of [...days].sort().slice(-4)) {
        try {
          c.requests += 1;
          await this.ingest(await this.providers.espn.day(slug, new Date(`${d}T12:00:00Z`)), c, cache, false);
        } catch (e) {
          c.errors.push(`${slug}:${d}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
    }
    return c;
  }
}
