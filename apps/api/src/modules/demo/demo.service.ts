import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { IngestionService } from '../ingestion/ingestion.service';
import { EntityResolverService } from '../normalization/entity-resolver.service';
import { CatalogService } from '../catalog/catalog.service';
import { PredictionsService } from '../predictions/predictions.service';
import { ValueBetsService } from '../value-bets/value-bets.service';
import { SettlementService } from '../settlement/settlement.service';
import { ModelMetricsService } from '../model-metrics/model-metrics.service';
import { demoAnchor, demoOdds, generateDemoSeason, type DemoMatch } from './demo.generator';

export const DEMO_STEPS = ['history', 'upcoming', 'recent', 'live', 'compute', 'metrics', 'advance', 'purge'] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];

export interface DemoStepResult {
  step: DemoStep;
  processed: number;
  remaining: number;
  details?: Record<string, unknown>;
}

const HOUR = 3600_000;

/**
 * Carga por pasos los datos ficticios de demostración a través del pipeline
 * real (normalización, cuotas, predicciones, oportunidades, liquidación). Cada
 * paso es idempotente y respeta un plazo para caber en funciones serverless:
 * si queda trabajo pendiente se vuelve a invocar el mismo paso.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly resolver: EntityResolverService,
    private readonly catalog: CatalogService,
    private readonly predictions: PredictionsService,
    private readonly valueBets: ValueBetsService,
    private readonly settlement: SettlementService,
    private readonly metrics: ModelMetricsService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  private assertEnabled() {
    if (!this.env.DEMO_MODE) throw new ForbiddenException('DEMO_MODE no está activo');
  }

  private async mappedFixtures(): Promise<Map<string, string>> {
    const rows = await this.prisma.providerEntityMap.findMany({ where: { provider: 'DEMO', entityType: 'FIXTURE' }, select: { externalId: true, internalId: true } });
    return new Map(rows.map((r) => [r.externalId, r.internalId]));
  }

  /** Alinea capturedAt con el instante de origen de las cuotas demo (aperturas en el pasado). */
  private async alignDemoSnapshots() {
    await this.prisma.$executeRaw`UPDATE "odds_snapshots" SET "capturedAt" = "sourceTimestamp" WHERE "provider" = 'DEMO' AND "capturedAt" <> "sourceTimestamp"`;
  }

  private async ingestOddsTwice(m: DemoMatch, seed: number, openingAt: Date, currentAt: Date) {
    await this.ingestion.ingestOddsEvent(demoOdds(m, openingAt, seed));
    await this.ingestion.ingestOddsEvent(demoOdds(m, currentAt, seed + 7));
  }

  async run(step: DemoStep, budgetMs = 230_000): Promise<DemoStepResult> {
    this.assertEnabled();
    const deadline = Date.now() + budgetMs;
    const now = new Date();
    // Fecha ancla fija = día del primer sembrado: los partidos no se mueven en ejecuciones posteriores.
    const first = await this.prisma.providerEntityMap.findFirst({ where: { provider: 'DEMO' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    const season = generateDemoSeason(now, demoAnchor(first?.createdAt ?? now));
    const mapped = await this.mappedFixtures();

    switch (step) {
      case 'history': {
        await this.catalog.upsertCatalog();
        const todo = season.filter((m) => m.phase === 'history' && !mapped.has(m.fixture.ref.externalId));
        let n = 0;
        for (const m of todo) {
          if (Date.now() > deadline) break;
          const { ids } = await this.ingestion.ingestFixtures([m.fixture]);
          await this.ingestion.ingestStatistics(ids[0], m.stats);
          n += 1;
        }
        if (n === todo.length) await this.rebuildStandings();
        return { step, processed: n, remaining: todo.length - n };
      }

      case 'upcoming': {
        const todo = season.filter((m) => m.phase === 'upcoming');
        const withOdds = new Set(
          (await this.prisma.oddsQuote.findMany({ where: { provider: 'DEMO' }, select: { fixtureId: true }, distinct: ['fixtureId'] })).map((q) => q.fixtureId),
        );
        let n = 0;
        let remaining = 0;
        for (const [i, m] of todo.entries()) {
          const existing = mapped.get(m.fixture.ref.externalId);
          if (existing && withOdds.has(existing)) continue;
          if (Date.now() > deadline) {
            remaining += 1;
            continue;
          }
          await this.ingestion.ingestFixtures([m.fixture]);
          await this.ingestOddsTwice(m, 5000 + i, new Date(now.getTime() - 30 * HOUR), new Date(now.getTime() - 20 * 60_000));
          n += 1;
        }
        await this.alignDemoSnapshots();
        return { step, processed: n, remaining };
      }

      case 'recent': {
        // Jornada de ayer: se publica antes del inicio (con cuotas y predicción de ese momento) y luego se liquida.
        const todo = season.filter((m) => m.phase === 'recent');
        const done = await this.prisma.fixture.count({ where: { id: { in: todo.map((m) => mapped.get(m.fixture.ref.externalId) ?? '') }, status: 'FINISHED' } });
        if (done === todo.length) return { step, processed: 0, remaining: 0 };
        const history = await this.predictions.loadHistory('FOOTBALL', new Date(now.getTime() - 800 * 24 * HOUR), now);
        let n = 0;
        for (const [i, m] of todo.entries()) {
          if (Date.now() > deadline) break;
          const kickoff = m.fixture.kickoff.getTime();
          const { ids } = await this.ingestion.ingestFixtures([{ ...m.fixture, status: 'SCHEDULED', homeScore: null, awayScore: null }]);
          await this.ingestOddsTwice(m, 9000 + i, new Date(kickoff - 30 * HOUR), new Date(kickoff - 3 * HOUR));
          await this.alignDemoSnapshots();
          await this.predictions.predictAndStore(ids[0], { cutoff: new Date(kickoff - 2 * HOUR), history: history.filter((h) => h.kickoff.getTime() < kickoff - 2 * HOUR) });
          n += 1;
        }
        if (n < todo.length) return { step, processed: n, remaining: todo.length - n };
        const firstKickoff = Math.min(...todo.map((m) => m.fixture.kickoff.getTime()));
        const published = await this.valueBets.computeAll(new Date(firstKickoff - HOUR));
        for (const m of todo) {
          await this.ingestion.ingestFixtures([{ ...m.fixture, status: 'FINISHED', statusDetail: 'FT', homeScore: m.finalScore!.home, awayScore: m.finalScore!.away, htHomeScore: m.finalScore!.htHome, htAwayScore: m.finalScore!.htAway }]);
        }
        const closed = await this.settlement.closeStartedValueBets(now);
        const settled = await this.settlement.settlePending();
        return { step, processed: n, remaining: 0, details: { published, closed, settled } };
      }

      case 'live': {
        const todo = season.filter((m) => m.phase === 'live' && !mapped.has(m.fixture.ref.externalId));
        for (const m of todo) {
          const { ids } = await this.ingestion.ingestFixtures([m.fixture]);
          const events = [];
          for (let g = 0; g < (m.fixture.homeScore ?? 0); g++) events.push({ fixtureRef: m.fixture.ref, teamRef: m.fixture.home.ref, minute: 8 + g * 17, type: 'Goal', detail: 'Normal Goal', playerName: `Jugador demo ${g + 9}` });
          for (let g = 0; g < (m.fixture.awayScore ?? 0); g++) events.push({ fixtureRef: m.fixture.ref, teamRef: m.fixture.away.ref, minute: 14 + g * 19, type: 'Goal', detail: 'Normal Goal', playerName: `Jugador demo ${g + 11}` });
          events.push({ fixtureRef: m.fixture.ref, teamRef: m.fixture.away.ref, minute: 22, type: 'Card', detail: 'Yellow Card', playerName: 'Jugador demo 4' });
          await this.ingestion.ingestEvents(ids[0], events.filter((e) => e.minute <= (m.fixture.elapsedMinutes ?? 90)));
        }
        return { step, processed: todo.length, remaining: 0 };
      }

      case 'compute': {
        const preds = await this.predictions.computeUpcoming(10);
        const vbs = await this.valueBets.computeAll();
        return { step, processed: preds.fixtures, remaining: 0, details: { preds, vbs } };
      }

      case 'metrics': {
        const backtest = await this.metrics.runBacktest(now, deadline - 20_000);
        if (backtest.incomplete) return { step, processed: backtest.created, remaining: 1, details: backtest };
        const calibration = await this.metrics.calibrateAndEvaluate();
        const live = await this.metrics.liveBettingMetrics();
        return { step, processed: backtest.created, remaining: 0, details: { calibration, live } };
      }

      case 'advance': {
        // Avance diario automático: finaliza los partidos ya "jugados", liquida y refresca cuotas de los próximos.
        let finished = 0;
        for (const m of season.filter((x) => x.phase !== 'history' && x.finalScore)) {
          const id = mapped.get(m.fixture.ref.externalId);
          if (!id || m.fixture.kickoff.getTime() > now.getTime() - 2 * HOUR) continue;
          const f = await this.prisma.fixture.findUnique({ where: { id }, select: { status: true } });
          if (!f || f.status === 'FINISHED') continue;
          const fs = m.finalScore!;
          await this.ingestion.ingestFixtures([{ ...m.fixture, status: 'FINISHED', statusDetail: 'FT', elapsedMinutes: 90, period: 'FT', homeScore: fs.home, awayScore: fs.away, htHomeScore: fs.htHome, htAwayScore: fs.htAway }]);
          finished += 1;
        }
        const closed = await this.settlement.closeStartedValueBets(now);
        const settled = await this.settlement.settlePending();
        const day = Math.floor(now.getTime() / (24 * HOUR));
        let refreshed = 0;
        for (const [i, m] of season.filter((x) => x.phase === 'upcoming' && x.fixture.kickoff > now).entries()) {
          if (Date.now() > deadline || !mapped.has(m.fixture.ref.externalId)) continue;
          await this.ingestion.ingestOddsEvent(demoOdds(m, new Date(now.getTime() - 15 * 60_000), 5000 + i + day * 13));
          refreshed += 1;
        }
        await this.alignDemoSnapshots();
        return { step, processed: finished, remaining: 0, details: { finished, closed, settled, refreshed } };
      }

      case 'purge':
        return { step, processed: await this.purge(), remaining: 0 };
    }
  }

  /** Clasificación derivada de los resultados ficticios ya cargados. */
  private async rebuildStandings() {
    const leagues = await this.prisma.providerEntityMap.findMany({ where: { provider: 'DEMO', entityType: 'LEAGUE' } });
    for (const l of leagues) {
      const fixtures = await this.prisma.fixture.findMany({ where: { leagueId: l.internalId, status: 'FINISHED', primaryProvider: 'DEMO' }, orderBy: { kickoff: 'asc' } });
      const table = new Map<string, { played: number; won: number; drawn: number; lost: number; gf: number; ga: number; form: string[] }>();
      const row = (id: string) => table.get(id) ?? (table.set(id, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, form: [] }), table.get(id)!);
      for (const f of fixtures) {
        const h = row(f.homeTeamId);
        const a = row(f.awayTeamId);
        const hs = f.homeScore ?? 0;
        const as = f.awayScore ?? 0;
        h.played++;
        a.played++;
        h.gf += hs;
        h.ga += as;
        a.gf += as;
        a.ga += hs;
        const [rh, ra] = hs > as ? (['W', 'L'] as const) : hs < as ? (['L', 'W'] as const) : (['D', 'D'] as const);
        for (const [side, res] of [[h, rh], [a, ra]] as const) {
          side.form.push(res);
          if (res === 'W') side.won++;
          else if (res === 'L') side.lost++;
          else side.drawn++;
        }
      }
      const sorted = [...table.entries()].sort(([, x], [, y]) => y.won * 3 + y.drawn - (x.won * 3 + x.drawn) || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf);
      for (const [rank, [teamId, r]] of sorted.entries()) {
        const data = { rank: rank + 1, points: r.won * 3 + r.drawn, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalsFor: r.gf, goalsAgainst: r.ga, form: r.form.slice(-5).join('') };
        await this.prisma.standing.upsert({
          where: { leagueId_season_groupName_teamId: { leagueId: l.internalId, season: '2026', groupName: '', teamId } },
          create: { leagueId: l.internalId, season: '2026', groupName: '', teamId, ...data },
          update: data,
        });
      }
    }
  }

  /** Elimina todo lo generado por el demo (proveedor DEMO y casas demo-*). No toca datos reales. */
  async purge(): Promise<number> {
    this.assertEnabled();
    const fixtures = (await this.prisma.fixture.findMany({ where: { primaryProvider: 'DEMO' }, select: { id: true } })).map((f) => f.id);
    const runs = (await this.prisma.predictionRun.findMany({ where: { fixtureId: { in: fixtures } }, select: { id: true } })).map((r) => r.id);
    const where = { fixtureId: { in: fixtures } };
    const maps = await this.prisma.providerEntityMap.findMany({ where: { provider: 'DEMO' } });
    const teamIds = maps.filter((m) => m.entityType === 'TEAM').map((m) => m.internalId);
    const leagueIds = maps.filter((m) => m.entityType === 'LEAGUE').map((m) => m.internalId);
    const playerIds = maps.filter((m) => m.entityType === 'PLAYER').map((m) => m.internalId);
    await this.prisma.$transaction([
      this.prisma.valueBet.deleteMany({ where }),
      this.prisma.calculatedProbability.deleteMany({ where: { predictionRunId: { in: runs } } }),
      this.prisma.predictionRun.deleteMany({ where }),
      this.prisma.oddsQuote.deleteMany({ where }),
      this.prisma.oddsSnapshot.deleteMany({ where }),
      this.prisma.affiliateClick.deleteMany({ where }),
      this.prisma.challengeFixture.deleteMany({ where }),
      this.prisma.fixtureEvent.deleteMany({ where }),
      this.prisma.fixtureLineup.deleteMany({ where }),
      this.prisma.injury.deleteMany({ where: { OR: [where, { teamId: { in: teamIds } }] } }),
      this.prisma.fixtureStat.deleteMany({ where }),
      this.prisma.matchViewHistory.deleteMany({ where }),
      this.prisma.legacyOddsSnapshot.deleteMany({ where }),
      this.prisma.legacyCalculatedProbability.deleteMany({ where }),
      this.prisma.fixture.deleteMany({ where: { id: { in: fixtures } } }),
      this.prisma.standing.deleteMany({ where: { leagueId: { in: leagueIds } } }),
      this.prisma.player.deleteMany({ where: { id: { in: playerIds } } }),
      this.prisma.team.deleteMany({ where: { id: { in: teamIds }, homeFixtures: { none: {} }, awayFixtures: { none: {} } } }),
      this.prisma.season.deleteMany({ where: { leagueId: { in: leagueIds } } }),
      this.prisma.league.deleteMany({ where: { id: { in: leagueIds }, fixtures: { none: {} } } }),
      this.prisma.providerEntityMap.deleteMany({ where: { provider: 'DEMO' } }),
      this.prisma.bookmaker.deleteMany({ where: { slug: { startsWith: 'demo-' }, affiliateClicks: { none: {} } } }),
      // Las métricas y calibradores se recalculan con los datos reales.
      this.prisma.modelMetricSnapshot.deleteMany({}),
      this.prisma.calibrationModel.deleteMany({}),
    ]);
    this.logger.log(`Demo eliminado: ${fixtures.length} partidos`);
    return fixtures.length;
  }
}
