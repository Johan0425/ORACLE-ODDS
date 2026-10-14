import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { MARKET_DEFINITIONS, isMarketKey, lineKey, removeVig } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { sha256 } from '../../common/hashing';
import { entitiesNormalized } from '../../common/metrics';
import { EntityResolverService } from '../normalization/entity-resolver.service';
import { normalizeName, slugify } from '../normalization/names';
import type {
  NormalizedEvent,
  NormalizedFixture,
  NormalizedInjury,
  NormalizedLineup,
  NormalizedOddsEvent,
  NormalizedPrice,
  NormalizedScoreUpdate,
  NormalizedStanding,
  NormalizedTeamStats,
} from '../../providers/types';

export interface IngestCounters {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

const emptyCounters = (): IngestCounters => ({ fetched: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 });

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly bookmakerCache = new Map<string, { id: string; isAuthorized: boolean }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: EntityResolverService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async ingestFixtures(fixtures: NormalizedFixture[]): Promise<IngestCounters & { ids: string[] }> {
    const c = { ...emptyCounters(), ids: [] as string[] };
    c.fetched = fixtures.length;
    for (const f of fixtures) {
      const { id, action } = await this.resolver.upsertFixture(f);
      c.ids.push(id);
      if (action === 'created') c.created += 1;
      else if (action === 'updated') c.updated += 1;
      else c.unchanged += 1;
    }
    return c;
  }

  async bookmakerId(key: string, name: string): Promise<{ id: string; isAuthorized: boolean }> {
    const slug = slugify(key);
    const cached = this.bookmakerCache.get(slug);
    if (cached) return cached;
    const isAuthorized = this.env.ALLOWED_BOOKMAKERS.map((b) => slugify(b)).includes(slug);
    const row = await this.prisma.bookmaker.upsert({
      where: { slug },
      create: { slug, name, isAuthorized },
      // La autorización la gobierna ALLOWED_BOOKMAKERS: si se retira una casa de la lista deja de mostrarse.
      update: { isAuthorized },
    });
    const value = { id: row.id, isAuthorized: row.isAuthorized && row.isActive };
    this.bookmakerCache.set(slug, value);
    return value;
  }

  /** Probabilidades sin vig y overround por libro completo (misma casa, mercado, línea y modo). */
  private bookStats(prices: NormalizedPrice[]): Map<NormalizedPrice, { noVig: number | null; overround: number | null }> {
    const groups = new Map<string, NormalizedPrice[]>();
    for (const p of prices) {
      const key = `${p.bookmaker.key}|${p.marketKey}|${lineKey(p.line)}|${p.isLive}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    const out = new Map<NormalizedPrice, { noVig: number | null; overround: number | null }>();
    for (const group of groups.values()) {
      const def = isMarketKey(group[0].marketKey) ? MARKET_DEFINITIONS[group[0].marketKey] : null;
      const required = def && def.selections !== 'SCORES' && def.key !== 'DC' ? def.selections : null;
      const complete = required && required.every((s) => group.some((p) => p.selectionKey === s)) && group.length === required.length;
      if (!complete) {
        group.forEach((p) => out.set(p, { noVig: null, overround: null }));
        continue;
      }
      const ordered = required!.map((s) => group.find((p) => p.selectionKey === s)!);
      const r = removeVig(ordered.map((p) => p.priceDecimal), this.env.VIG_METHOD);
      ordered.forEach((p, i) => out.set(p, { noVig: r.probabilities[i], overround: r.overround }));
    }
    return out;
  }

  /**
   * Persiste cuotas de un evento. Idempotente: si el precio vigente no cambió
   * solo se actualiza `lastSeenAt`; si cambió se inserta un snapshot nuevo y se
   * actualiza el estado vigente conservando la apertura.
   */
  async ingestOddsEvent(event: NormalizedOddsEvent): Promise<IngestCounters & { fixtureId: string | null }> {
    const c = { ...emptyCounters(), fixtureId: null as string | null };
    c.fetched = event.prices.length;
    const fixtureId = await this.resolver.resolveOddsEvent(event);
    if (!fixtureId) {
      c.skipped = event.prices.length;
      return c;
    }
    c.fixtureId = fixtureId;
    const stats = this.bookStats(event.prices);
    const now = new Date();

    for (const p of event.prices) {
      const book = await this.bookmakerId(p.bookmaker.key, p.bookmaker.name);
      const lk = lineKey(p.line);
      const where = {
        fixtureId_bookmakerId_marketKey_selectionKey_lineKey_isLive: {
          fixtureId,
          bookmakerId: book.id,
          marketKey: p.marketKey,
          selectionKey: p.selectionKey,
          lineKey: lk,
          isLive: p.isLive,
        },
      };
      const quote = await this.prisma.oddsQuote.findUnique({ where });
      const s = stats.get(p) ?? { noVig: null, overround: null };
      if (quote && quote.currentPrice === p.priceDecimal && quote.isSuspended === p.isSuspended) {
        await this.prisma.oddsQuote.update({
          where: { id: quote.id },
          data: { lastSeenAt: now, sourceTimestamp: p.sourceTimestamp, impliedProbabilityNoVig: s.noVig, overround: s.overround },
        });
        c.unchanged += 1;
        continue;
      }
      const rawPayloadHash = sha256(`${event.ref.provider}|${p.priceDecimal}|${p.isSuspended}|${p.sourceTimestamp.toISOString()}`);
      const snapshotData: Prisma.OddsSnapshotUncheckedCreateInput = {
        fixtureId,
        bookmakerId: book.id,
        provider: event.ref.provider,
        marketKey: p.marketKey,
        selectionKey: p.selectionKey,
        line: p.line,
        lineKey: lk,
        priceDecimal: p.priceDecimal,
        impliedProbabilityRaw: 1 / p.priceDecimal,
        impliedProbabilityNoVig: s.noVig,
        overround: s.overround,
        isLive: p.isLive,
        isSuspended: p.isSuspended,
        sourceTimestamp: p.sourceTimestamp,
        directBetUrl: p.directBetUrl ?? null,
        rawPayloadHash,
      };
      const snapshot = await this.prisma.oddsSnapshot.upsert({
        where: {
          fixtureId_bookmakerId_marketKey_selectionKey_lineKey_isLive_rawPayloadHash: {
            fixtureId,
            bookmakerId: book.id,
            marketKey: p.marketKey,
            selectionKey: p.selectionKey,
            lineKey: lk,
            isLive: p.isLive,
            rawPayloadHash,
          },
        },
        create: snapshotData,
        update: {},
      });
      await this.prisma.oddsQuote.upsert({
        where,
        create: {
          fixtureId,
          bookmakerId: book.id,
          provider: event.ref.provider,
          marketKey: p.marketKey,
          selectionKey: p.selectionKey,
          line: p.line,
          lineKey: lk,
          openingPrice: p.priceDecimal,
          openingAt: p.sourceTimestamp,
          currentPrice: p.priceDecimal,
          currentSnapshotId: snapshot.id,
          impliedProbabilityNoVig: s.noVig,
          overround: s.overround,
          isLive: p.isLive,
          isSuspended: p.isSuspended,
          sourceTimestamp: p.sourceTimestamp,
          lastChangedAt: now,
          lastSeenAt: now,
          directBetUrl: p.directBetUrl ?? null,
        },
        update: {
          previousPrice: quote?.currentPrice,
          currentPrice: p.priceDecimal,
          currentSnapshotId: snapshot.id,
          impliedProbabilityNoVig: s.noVig,
          overround: s.overround,
          isSuspended: p.isSuspended,
          sourceTimestamp: p.sourceTimestamp,
          lastChangedAt: now,
          lastSeenAt: now,
          directBetUrl: p.directBetUrl ?? undefined,
        },
      });
      if (quote) c.updated += 1;
      else c.created += 1;
    }
    entitiesNormalized.inc({ entity: 'odds', action: 'created' }, c.created);
    entitiesNormalized.inc({ entity: 'odds', action: 'updated' }, c.updated);
    return c;
  }

  /** Marca suspendidas las cuotas en vivo de un partido que el proveedor dejó de ofrecer en esta captura. */
  async suspendMissingLiveQuotes(fixtureId: string, seenAt: Date): Promise<number> {
    const res = await this.prisma.oddsQuote.updateMany({
      where: { fixtureId, isLive: true, isSuspended: false, lastSeenAt: { lt: seenAt } },
      data: { isSuspended: true },
    });
    return res.count;
  }

  async ingestStatistics(fixtureId: string, stats: NormalizedTeamStats[]): Promise<number> {
    const fixture = await this.prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } });
    let n = 0;
    for (const s of stats) {
      const teamId = await this.resolver.findMapped(s.teamRef.provider, 'TEAM', s.teamRef.externalId);
      if (!teamId || (teamId !== fixture.homeTeamId && teamId !== fixture.awayTeamId)) continue;
      const isHome = teamId === fixture.homeTeamId;
      const data = {
        goalsFor: isHome ? fixture.homeScore : fixture.awayScore,
        goalsAgainst: isHome ? fixture.awayScore : fixture.homeScore,
        corners: s.corners ?? null,
        yellowCards: s.yellowCards ?? null,
        redCards: s.redCards ?? null,
        shotsOnGoal: s.shotsOnGoal ?? null,
        shotsTotal: s.shotsTotal ?? null,
        possession: s.possession ?? null,
        expectedGoals: s.expectedGoals ?? null,
        raw: s.raw as Prisma.InputJsonValue,
      };
      await this.prisma.fixtureStat.upsert({
        where: { fixtureId_teamId: { fixtureId, teamId } },
        create: { fixtureId, teamId, ...data },
        update: data,
      });
      n += 1;
    }
    return n;
  }

  async ingestEvents(fixtureId: string, events: NormalizedEvent[]): Promise<number> {
    let n = 0;
    for (const e of events) {
      const teamId = e.teamRef ? await this.resolver.findMapped(e.teamRef.provider, 'TEAM', e.teamRef.externalId) : null;
      const eventKey = sha256([e.minute, e.extraMinute ?? '', e.type, e.detail ?? '', e.teamRef?.externalId ?? '', normalizeName(e.playerName ?? '')].join('|')).slice(0, 32);
      await this.prisma.fixtureEvent.upsert({
        where: { fixtureId_eventKey: { fixtureId, eventKey } },
        create: { fixtureId, eventKey, teamId, minute: e.minute, extraMinute: e.extraMinute ?? null, type: e.type, detail: e.detail ?? null, playerName: e.playerName ?? null, assistName: e.assistName ?? null },
        update: {},
      });
      n += 1;
    }
    return n;
  }

  async ingestLineups(fixtureId: string, lineups: NormalizedLineup[]): Promise<number> {
    let n = 0;
    for (const l of lineups) {
      const teamId = await this.resolver.findMapped(l.teamRef.provider, 'TEAM', l.teamRef.externalId);
      if (!teamId) continue;
      const data = {
        formation: l.formation ?? null,
        coach: l.coach ?? null,
        startXI: l.startXI as unknown as Prisma.InputJsonValue,
        substitutes: l.substitutes as unknown as Prisma.InputJsonValue,
        confirmedAt: l.startXI.length >= 11 ? new Date() : null,
      };
      await this.prisma.fixtureLineup.upsert({ where: { fixtureId_teamId: { fixtureId, teamId } }, create: { fixtureId, teamId, ...data }, update: data });
      n += 1;
    }
    if (n >= 2) await this.prisma.fixture.update({ where: { id: fixtureId }, data: { lineupsConfirmed: true } });
    return n;
  }

  async ingestInjuries(fixtureId: string, injuries: NormalizedInjury[]): Promise<number> {
    let n = 0;
    for (const i of injuries) {
      const teamId = await this.resolver.findMapped(i.teamRef.provider, 'TEAM', i.teamRef.externalId);
      if (!teamId) continue;
      let playerId = await this.resolver.findMapped(i.playerRef.provider, 'PLAYER', i.playerRef.externalId);
      if (!playerId) {
        const player = await this.prisma.player.create({ data: { teamId, name: i.playerName, normalizedName: normalizeName(i.playerName) } });
        playerId = await this.resolver.link(i.playerRef.provider, 'PLAYER', i.playerRef.externalId, player.id, { name: i.playerName });
      }
      const externalKey = `${i.playerRef.provider}:${fixtureId}:${i.playerRef.externalId}`;
      await this.prisma.injury.upsert({
        where: { externalKey },
        create: { externalKey, playerId, teamId, fixtureId, status: i.status, reason: i.reason ?? null, source: i.playerRef.provider },
        update: { status: i.status, reason: i.reason ?? null },
      });
      n += 1;
    }
    return n;
  }

  async ingestStandings(standings: NormalizedStanding[]): Promise<number> {
    let n = 0;
    for (const s of standings) {
      const leagueId = await this.resolver.findMapped(s.leagueRef.provider, 'LEAGUE', s.leagueRef.externalId);
      if (!leagueId) continue;
      const teamId = await this.resolver.resolveTeam(s.team, leagueId);
      const data = { rank: s.rank, points: s.points, played: s.played, won: s.won, drawn: s.drawn, lost: s.lost, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, form: s.form ?? null };
      const groupName = s.group ?? '';
      await this.prisma.standing.upsert({
        where: { leagueId_season_groupName_teamId: { leagueId, season: s.season, groupName, teamId } },
        create: { leagueId, season: s.season, groupName, teamId, ...data },
        update: data,
      });
      n += 1;
    }
    return n;
  }

  /** Resultados de un proveedor de cuotas (The Odds API): solo actualiza partidos ya mapeados. */
  async ingestScoreUpdates(updates: NormalizedScoreUpdate[]): Promise<number> {
    let n = 0;
    for (const u of updates) {
      const fixtureId = await this.resolver.findMapped(u.ref.provider, 'FIXTURE', u.ref.externalId);
      if (!fixtureId || u.homeScore == null || u.awayScore == null) continue;
      const f = await this.prisma.fixture.findUnique({ where: { id: fixtureId } });
      // API-Football es la fuente autoritativa de marcadores cuando existe.
      if (!f || f.primaryProvider === 'API_FOOTBALL') continue;
      await this.prisma.fixture.update({
        where: { id: fixtureId },
        data: { homeScore: u.homeScore, awayScore: u.awayScore, lastScoreUpdateAt: u.lastUpdate ?? new Date(), status: u.completed ? 'FINISHED' : 'LIVE' },
      });
      n += 1;
    }
    return n;
  }
}
