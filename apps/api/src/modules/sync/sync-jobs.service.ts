import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DataProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { ProviderRegistry } from '../../providers/providers.module';
import { QuotaExceededError } from '../../common/http/provider-http-client';
import { IngestionService } from '../ingestion/ingestion.service';
import { EntityResolverService } from '../normalization/entity-resolver.service';
import { CatalogService } from '../catalog/catalog.service';
import { PredictionsService } from '../predictions/predictions.service';
import { ValueBetsService } from '../value-bets/value-bets.service';
import { SettlementService } from '../settlement/settlement.service';
import { ModelMetricsService } from '../model-metrics/model-metrics.service';
import { LiveEventsService } from '../live/live-events.service';
import { ChallengesService } from '../challenges/challenges.service';
import { SocialExportService } from '../share/social-export.service';
import { JobRunnerService, SkipJob, type JobOutcome } from './job-runner.service';

export const JOB_NAMES = [
  'sync:sports-catalog',
  'sync:leagues',
  'sync:teams',
  'sync:historical-fixtures',
  'sync:upcoming-fixtures',
  'sync:live-fixtures',
  'sync:fixture-details',
  'sync:lineups',
  'sync:injuries',
  'sync:prematch-odds',
  'sync:live-odds',
  'sync:results',
  'sync:settlements',
  'compute:predictions',
  'compute:value-bets',
  'compute:model-metrics',
  'export:social-card',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

export function isJobName(v: string): v is JobName {
  return (JOB_NAMES as readonly string[]).includes(v);
}

const DAY = 86_400_000;
const DETAILS_PER_RUN = 25;

/**
 * Implementación de cada job del pipeline. Los jobs son idempotentes: se pueden
 * reintentar o ejecutar dos veces sin duplicar partidos, cuotas ni estadísticas.
 */
@Injectable()
export class SyncJobsService {
  private readonly logger = new Logger(SyncJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: JobRunnerService,
    private readonly providers: ProviderRegistry,
    private readonly ingestion: IngestionService,
    private readonly resolver: EntityResolverService,
    private readonly catalog: CatalogService,
    private readonly predictions: PredictionsService,
    private readonly valueBets: ValueBetsService,
    private readonly settlement: SettlementService,
    private readonly metrics: ModelMetricsService,
    private readonly live: LiveEventsService,
    private readonly challenges: ChallengesService,
    private readonly social: SocialExportService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  private providerOf(name: JobName): DataProvider | null {
    if (['sync:prematch-odds', 'sync:live-odds'].includes(name)) return 'THE_ODDS_API';
    if (name.startsWith('sync:') && !['sync:sports-catalog', 'sync:settlements'].includes(name)) return 'API_FOOTBALL';
    return null;
  }

  async execute(name: JobName, correlationId?: string): Promise<JobOutcome> {
    return this.runner.run(name, this.providerOf(name), () => this.handlers[name](), { correlationId });
  }

  private requireApiFootball() {
    if (!this.providers.apiFootball.isConfigured()) throw new SkipJob('PROVIDER_NOT_CONFIGURED: API_FOOTBALL_KEY');
    if (this.env.TRACKED_LEAGUES.length === 0) throw new SkipJob('TRACKED_LEAGUES vacío');
  }

  private async seasonFor(leagueId: string): Promise<string | null> {
    return this.providers.apiFootball.currentSeason(leagueId);
  }

  /** Ejecuta una función por liga; un fallo de cupo detiene el job, otros errores se registran y continúan. */
  private async perLeague(fn: (leagueExternalId: string, season: string) => Promise<{ fetched: number; created: number; updated: number; unchanged: number }>): Promise<JobOutcome> {
    const totals = { fetched: 0, created: 0, updated: 0, duplicates: 0 };
    const errors: string[] = [];
    for (const league of this.env.TRACKED_LEAGUES) {
      try {
        const season = await this.seasonFor(league);
        if (!season) {
          errors.push(`${league}: sin temporada vigente`);
          continue;
        }
        const r = await fn(league, season);
        totals.fetched += r.fetched;
        totals.created += r.created;
        totals.updated += r.updated;
        totals.duplicates += r.unchanged;
      } catch (e) {
        if (e instanceof QuotaExceededError) throw e;
        errors.push(`${league}: ${(e as Error).message}`);
      }
    }
    if (errors.length === this.env.TRACKED_LEAGUES.length && errors.length > 0) throw new Error(errors.join('; '));
    return { status: 'SUCCEEDED', ...totals, reason: errors.length ? errors.join('; ') : undefined };
  }

  private readonly handlers: Record<JobName, () => Promise<JobOutcome>> = {
    'sync:sports-catalog': async () => {
      const r = await this.catalog.upsertCatalog();
      let oddsSports = 0;
      if (this.providers.oddsApi.isConfigured()) {
        // Informativo: un fallo aquí no invalida el catálogo de referencia.
        oddsSports = await this.providers.oddsApi
          .listSports()
          .then((list) => list.filter((s) => s.active).length)
          .catch(() => -1);
      }
      return { status: 'SUCCEEDED', fetched: r.markets, details: { ...r, oddsSportsActive: oddsSports } };
    },

    'sync:leagues': async () => {
      this.requireApiFootball();
      const leagues = await this.providers.apiFootball.getLeagues(this.env.TRACKED_LEAGUES);
      for (const l of leagues) {
        const id = await this.resolver.resolveLeague(l);
        await this.prisma.league.update({ where: { id }, data: { isTracked: true } });
      }
      return { status: 'SUCCEEDED', fetched: leagues.length };
    },

    'sync:teams': async () => {
      this.requireApiFootball();
      return this.perLeague(async (league, season) => {
        const leagueId = await this.resolver.findMapped('API_FOOTBALL', 'LEAGUE', league);
        const teams = await this.providers.apiFootball.getTeams(league, season);
        for (const t of teams) {
          const id = await this.resolver.resolveTeam(t, leagueId);
          // Fallback de metadatos: solo escudo/estadio, y solo si faltan.
          if (!t.logoUrl && this.providers.theSportsDb.isConfigured()) {
            const meta = await this.providers.theSportsDb.findTeamBadge(t.name).catch(() => null);
            if (meta?.logoUrl) await this.prisma.team.update({ where: { id }, data: { logoUrl: meta.logoUrl, venueName: meta.venueName ?? undefined } });
          }
        }
        const standings = await this.providers.apiFootball.getStandings(league, season);
        await this.ingestion.ingestStandings(standings);
        return { fetched: teams.length, created: 0, updated: teams.length, unchanged: 0 };
      });
    },

    'sync:historical-fixtures': async () => {
      this.requireApiFootball();
      const state = await this.prisma.providerSyncState.findUnique({ where: { provider_jobName: { provider: 'API_FOOTBALL', jobName: 'sync:historical-fixtures' } } });
      // Incremental: desde la última sincronización exitosa (con margen) o, la primera vez, toda la temporada.
      const from = state?.lastSuccessfulSync ? new Date(state.lastSuccessfulSync.getTime() - 7 * DAY) : new Date(Date.now() - 365 * DAY);
      return this.perLeague(async (league, season) => {
        const prevSeason = String(Number(season) - 1);
        const fixtures = [
          ...(await this.providers.apiFootball.getFixtures({ leagueId: league, season, from, to: new Date() })),
          ...(!state?.lastSuccessfulSync && /^\d{4}$/.test(season) ? await this.providers.apiFootball.getFixtures({ leagueId: league, season: prevSeason, from, to: new Date() }) : []),
        ];
        return this.ingestion.ingestFixtures(fixtures);
      });
    },

    'sync:upcoming-fixtures': async () => {
      this.requireApiFootball();
      return this.perLeague(async (league, season) => {
        const fixtures = await this.providers.apiFootball.getFixtures({ leagueId: league, season, from: new Date(), to: new Date(Date.now() + 14 * DAY) });
        return this.ingestion.ingestFixtures(fixtures);
      });
    },

    'sync:live-fixtures': async () => {
      this.requireApiFootball();
      const fetchedAt = new Date();
      const liveNow = await this.providers.apiFootball.getLiveFixtures(this.env.TRACKED_LEAGUES);
      const result = await this.ingestion.ingestFixtures(liveNow);
      // Partidos que teníamos en vivo y ya no aparecen: se consultan por ID para obtener su estado final.
      const stale = await this.prisma.fixture.findMany({
        where: { status: { in: ['LIVE', 'SUSPENDED'] }, primaryProvider: 'API_FOOTBALL', id: { notIn: result.ids } },
        select: { externalIds: true },
      });
      const staleIds = stale.map((f) => (f.externalIds as Record<string, string>).API_FOOTBALL).filter(Boolean);
      if (staleIds.length) await this.ingestion.ingestFixtures(await this.providers.apiFootball.getFixturesByIds(staleIds));
      for (const [i, id] of result.ids.entries()) {
        const f = liveNow[i];
        await this.live.publish({
          type: 'fixture',
          fixtureId: id,
          at: new Date().toISOString(),
          latencySeconds: f.sourceTimestamp ? Math.max(0, (Date.now() - fetchedAt.getTime()) / 1000) : null,
          payload: { status: f.status, statusDetail: f.statusDetail, elapsed: f.elapsedMinutes, homeScore: f.homeScore, awayScore: f.awayScore },
        });
      }
      // Eventos de partidos en vivo (limitados por cupo).
      for (const [i, id] of result.ids.slice(0, 10).entries()) {
        const events = await this.providers.apiFootball.getFixtureEvents(liveNow[i].ref.externalId);
        await this.ingestion.ingestEvents(id, events);
      }
      return { status: 'SUCCEEDED', fetched: liveNow.length, updated: result.updated, created: result.created };
    },

    'sync:fixture-details': async () => {
      this.requireApiFootball();
      const targets = await this.prisma.fixture.findMany({
        where: { status: 'FINISHED', primaryProvider: 'API_FOOTBALL', kickoff: { gte: new Date(Date.now() - 400 * DAY) }, stats: { none: {} } },
        select: { id: true, externalIds: true },
        orderBy: { kickoff: 'desc' },
        take: DETAILS_PER_RUN,
      });
      let stats = 0;
      for (const f of targets) {
        const ext = (f.externalIds as Record<string, string>).API_FOOTBALL;
        if (!ext) continue;
        stats += await this.ingestion.ingestStatistics(f.id, await this.providers.apiFootball.getFixtureStatistics(ext));
        await this.ingestion.ingestEvents(f.id, await this.providers.apiFootball.getFixtureEvents(ext));
      }
      return { status: 'SUCCEEDED', fetched: targets.length, updated: stats };
    },

    'sync:lineups': async () => {
      this.requireApiFootball();
      const soon = await this.prisma.fixture.findMany({
        where: { status: 'SCHEDULED', primaryProvider: 'API_FOOTBALL', lineupsConfirmed: false, kickoff: { gte: new Date(), lte: new Date(Date.now() + 90 * 60_000) } },
        select: { id: true, externalIds: true },
        take: DETAILS_PER_RUN,
      });
      let n = 0;
      for (const f of soon) {
        const ext = (f.externalIds as Record<string, string>).API_FOOTBALL;
        if (ext) n += await this.ingestion.ingestLineups(f.id, await this.providers.apiFootball.getLineups(ext));
      }
      return { status: 'SUCCEEDED', fetched: soon.length, updated: n };
    },

    'sync:injuries': async () => {
      this.requireApiFootball();
      const upcoming = await this.prisma.fixture.findMany({
        where: { status: 'SCHEDULED', primaryProvider: 'API_FOOTBALL', kickoff: { gte: new Date(), lte: new Date(Date.now() + 3 * DAY) } },
        select: { id: true, externalIds: true },
        take: DETAILS_PER_RUN,
      });
      let n = 0;
      for (const f of upcoming) {
        const ext = (f.externalIds as Record<string, string>).API_FOOTBALL;
        if (ext) n += await this.ingestion.ingestInjuries(f.id, await this.providers.apiFootball.getInjuries(ext));
      }
      return { status: 'SUCCEEDED', fetched: upcoming.length, updated: n };
    },

    'sync:prematch-odds': async () => this.syncOdds(false),
    'sync:live-odds': async () => this.syncOdds(true),

    'sync:results': async () => {
      const pending = await this.prisma.fixture.findMany({
        where: {
          primaryProvider: { not: null },
          OR: [{ status: { in: ['LIVE', 'SUSPENDED'] } }, { status: 'SCHEDULED', kickoff: { lt: new Date(), gte: new Date(Date.now() - 2 * DAY) } }],
        },
        select: { id: true, primaryProvider: true, externalIds: true, league: { select: { id: true } } },
      });
      let updated = 0;
      const afIds = pending.filter((f) => f.primaryProvider === 'API_FOOTBALL').map((f) => (f.externalIds as Record<string, string>).API_FOOTBALL).filter(Boolean);
      if (afIds.length && this.providers.apiFootball.isConfigured()) updated += (await this.ingestion.ingestFixtures(await this.providers.apiFootball.getFixturesByIds(afIds))).updated;
      const oddsOnly = pending.some((f) => f.primaryProvider === 'THE_ODDS_API');
      if (oddsOnly && this.providers.oddsApi.isConfigured()) {
        for (const key of this.env.ODDS_SPORT_KEYS) updated += await this.ingestion.ingestScoreUpdates(await this.providers.oddsApi.getResults(key, 1));
      }
      if (!this.providers.apiFootball.isConfigured() && !this.providers.oddsApi.isConfigured()) throw new SkipJob('PROVIDER_NOT_CONFIGURED');
      return { status: 'SUCCEEDED', fetched: pending.length, updated };
    },

    'sync:settlements': async () => {
      const closed = await this.settlement.closeStartedValueBets();
      const settled = await this.settlement.settlePending();
      const challenges = await this.challenges.scoreAll();
      return { status: 'SUCCEEDED', updated: settled.valueBets + settled.probabilities, details: { closed, ...settled, challenges } };
    },

    'compute:predictions': async () => {
      const r = await this.predictions.computeUpcoming();
      return { status: 'SUCCEEDED', fetched: r.fixtures, created: r.created, duplicates: r.unchanged, details: r };
    },

    'compute:value-bets': async () => {
      const r = await this.valueBets.computeAll();
      return { status: 'SUCCEEDED', fetched: r.evaluated, created: r.published, updated: r.reconfirmed, details: r };
    },

    'compute:model-metrics': async () => {
      const r = await this.metrics.computeAll();
      return { status: 'SUCCEEDED', fetched: r.backtest.targets, created: r.backtest.created, details: { calibration: r.calibration, live: r.live } };
    },

    'export:social-card': async () => {
      const r = await this.social.exportDaily();
      return { status: 'SUCCEEDED', created: r.created, details: r };
    },
  };

  private async syncOdds(live: boolean): Promise<JobOutcome> {
    const sources = [this.providers.oddsApi, this.providers.oddsApiIo].filter((p) => p.isConfigured());
    const afOdds = this.env.ENABLE_API_FOOTBALL_ODDS && this.providers.apiFootball.isConfigured() && !live;
    if (sources.length === 0 && !afOdds) throw new SkipJob('PROVIDER_NOT_CONFIGURED: THE_ODDS_API_KEY');
    if (live) {
      const anyLive = await this.prisma.fixture.count({ where: { status: 'LIVE' } });
      // Evita gastar cupo consultando cuotas en vivo cuando no hay partidos en curso.
      if (anyLive === 0) throw new SkipJob('NO_LIVE_FIXTURES');
    }
    const seenAt = new Date();
    const totals = { fetched: 0, created: 0, updated: 0, duplicates: 0 };
    const liveFixtures = new Set<string>();
    if (this.providers.oddsApi.isConfigured()) {
      if (this.env.ODDS_SPORT_KEYS.length === 0 && sources.length === 1) throw new SkipJob('ODDS_SPORT_KEYS vacío');
      for (const key of this.env.ODDS_SPORT_KEYS) {
        const events = await this.providers.oddsApi.getOdds(key);
        for (const e of events) {
          const prices = e.prices.filter((p) => p.isLive === live);
          if (prices.length === 0) continue;
          const r = await this.ingestion.ingestOddsEvent({ ...e, prices });
          totals.fetched += r.fetched;
          totals.created += r.created;
          totals.updated += r.updated;
          totals.duplicates += r.unchanged;
          if (live && r.fixtureId) {
            liveFixtures.add(r.fixtureId);
            await this.live.publish({ type: 'odds', fixtureId: r.fixtureId, at: seenAt.toISOString(), payload: { changed: r.created + r.updated } });
          }
        }
      }
    }
    if (this.providers.oddsApiIo.isConfigured()) {
      for (const key of this.env.ODDS_API_IO_COMPETITIONS) {
        const events = live ? await this.providers.oddsApiIo.getLiveOdds(key) : await this.providers.oddsApiIo.getPrematchOdds(key);
        for (const e of events) {
          const r = await this.ingestion.ingestOddsEvent(e);
          totals.fetched += r.fetched;
          totals.created += r.created;
          totals.updated += r.updated;
          totals.duplicates += r.unchanged;
          if (live && r.fixtureId) liveFixtures.add(r.fixtureId);
        }
      }
    }
    if (afOdds) {
      const upcoming = await this.prisma.fixture.findMany({
        where: { status: 'SCHEDULED', primaryProvider: 'API_FOOTBALL', kickoff: { gte: new Date(), lte: new Date(Date.now() + 3 * DAY) } },
        select: { externalIds: true },
        take: DETAILS_PER_RUN,
      });
      for (const f of upcoming) {
        const ext = (f.externalIds as Record<string, string>).API_FOOTBALL;
        if (!ext) continue;
        for (const e of await this.providers.apiFootball.getFixtureOdds(ext)) {
          const r = await this.ingestion.ingestOddsEvent(e);
          totals.fetched += r.fetched;
          totals.created += r.created;
          totals.updated += r.updated;
        }
      }
    }
    for (const id of liveFixtures) await this.ingestion.suspendMissingLiveQuotes(id, seenAt);
    return { status: 'SUCCEEDED', ...totals };
  }
}
