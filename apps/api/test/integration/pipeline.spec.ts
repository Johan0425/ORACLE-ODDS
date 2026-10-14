import request from 'supertest';
import { createTestApp, resetDatabase, type TestContext } from '../helpers/app';
import { SyncJobsService } from '../../src/modules/sync/sync-jobs.service';
import { ValueBetsService } from '../../src/modules/value-bets/value-bets.service';
import type { Route } from '../helpers/recorded';

jest.setTimeout(180_000);

const AF: Record<string, Route> = {
  leagues: { match: /\/leagues\?/, file: 'api-football/leagues.json' },
  history: { match: /\/fixtures\?.*from=/, file: 'api-football/fixtures-history.json' },
  upcoming: { match: /\/fixtures\?.*from=/, file: 'api-football/fixtures-upcoming.json' },
  stats: { match: /fixtures\/statistics\?fixture=500089/, file: 'api-football/statistics.json' },
  noStats: { match: /fixtures\/statistics/, body: { errors: [], response: [] } },
  events: { match: /fixtures\/events/, body: { errors: [], response: [] } },
  lineups: { match: /fixtures\/lineups/, file: 'api-football/lineups.json' },
  injuries: { match: /injuries\?fixture=600001/, file: 'api-football/injuries.json' },
  noInjuries: { match: /injuries/, body: { errors: [], response: [] } },
  teams: { match: /\/teams\?/, body: { errors: [], response: [] } },
  standings: { match: /standings/, file: 'api-football/standings.json' },
  result: { match: /\/fixtures\?.*ids=/, file: 'api-football/fixture-result.json' },
};
const ODDS1: Route = { match: /\/odds/, file: 'the-odds-api/odds-1.json', headers: { 'x-requests-remaining': '400' } };
const ODDS2: Route = { match: /\/odds/, file: 'the-odds-api/odds-2.json', headers: { 'x-requests-remaining': '399' } };

describe('pipeline de datos reales (respuestas grabadas)', () => {
  let ctx: TestContext;
  let jobs: SyncJobsService;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp({
      API_FOOTBALL_KEY: 'test-af',
      THE_ODDS_API_KEY: 'test-odds',
      TRACKED_LEAGUES: '9001',
      API_FOOTBALL_SEASON: '2026',
      API_FOOTBALL_PER_MINUTE: '100000',
      THE_ODDS_API_MONTHLY_LIMIT: '1000000',
      ODDS_SPORT_KEYS: 'soccer_testland_liga',
      ALLOWED_BOOKMAKERS: 'casa_uno,casa_dos,casa_tres',
      PUBLISH_REQUIRE_CALIBRATION: 'false',
      VALUE_MIN_EDGE: '0',
      VALUE_MIN_EV: '0',
      VALUE_MIN_QUALITY: '0',
      VALUE_MIN_BOOKMAKERS: '2',
      VALUE_MIN_CONFIDENCE: '0',
    });
    await resetDatabase(ctx.prisma);
    jobs = ctx.app.get(SyncJobsService);
  });

  afterAll(async () => ctx.close());

  it('catálogo y ligas', async () => {
    ctx.routes([AF.leagues]);
    expect((await jobs.execute('sync:sports-catalog')).status).toBe('SUCCEEDED');
    expect((await jobs.execute('sync:leagues')).status).toBe('SUCCEEDED');
    expect(await ctx.prisma.marketDefinition.count()).toBeGreaterThan(10);
    const map = await ctx.prisma.providerEntityMap.findUnique({ where: { provider_entityType_externalId: { provider: 'API_FOOTBALL', entityType: 'LEAGUE', externalId: '9001' } } });
    expect(map).not.toBeNull();
  });

  it('históricos: normaliza, mapea IDs y es idempotente', async () => {
    ctx.routes([AF.history]);
    const first = await jobs.execute('sync:historical-fixtures');
    expect(first.status).toBe('SUCCEEDED');
    expect(await ctx.prisma.fixture.count()).toBe(90);
    expect(await ctx.prisma.team.count()).toBe(6);
    // Segunda ejecución con la misma respuesta: cero duplicados.
    await jobs.execute('sync:historical-fixtures');
    expect(await ctx.prisma.fixture.count()).toBe(90);
    expect(await ctx.prisma.providerEntityMap.count({ where: { entityType: 'FIXTURE' } })).toBe(90);
    const state = await ctx.prisma.providerSyncState.findUnique({ where: { provider_jobName: { provider: 'API_FOOTBALL', jobName: 'sync:historical-fixtures' } } });
    expect(state?.lastSuccessfulSync).toBeInstanceOf(Date);
    expect(await ctx.prisma.syncRunLog.count({ where: { jobName: 'sync:historical-fixtures', status: 'SUCCEEDED' } })).toBe(2);
  });

  it('próximos partidos, detalles, alineaciones y lesiones', async () => {
    ctx.routes([AF.upcoming, AF.stats, AF.noStats, AF.events, AF.injuries, AF.noInjuries, AF.teams, AF.standings]);
    await jobs.execute('sync:upcoming-fixtures');
    expect(await ctx.prisma.fixture.count({ where: { status: 'SCHEDULED' } })).toBe(3);
    await jobs.execute('sync:fixture-details');
    expect(await ctx.prisma.fixtureStat.count()).toBe(2);
    const stat = await ctx.prisma.fixtureStat.findFirst({ where: { corners: 7 } });
    expect(stat?.expectedGoals).toBe(1.72);
    await jobs.execute('sync:injuries');
    expect(await ctx.prisma.injury.count()).toBe(1);
    await jobs.execute('sync:teams');
    expect(await ctx.prisma.standing.count()).toBe(6);
  });

  it('cuotas: empareja eventos con partidos existentes, guarda snapshots solo si cambian y conserva la apertura', async () => {
    ctx.routes([], [ODDS1]);
    const fixturesBefore = await ctx.prisma.fixture.count();
    const r = await jobs.execute('sync:prematch-odds');
    expect(r.status).toBe('SUCCEEDED');
    expect(await ctx.prisma.fixture.count()).toBe(fixturesBefore);
    const snaps1 = await ctx.prisma.oddsSnapshot.count();
    expect(snaps1).toBeGreaterThan(30);
    expect(await ctx.prisma.bookmaker.count({ where: { isAuthorized: true } })).toBe(3);
    expect(await ctx.prisma.bookmaker.findUnique({ where: { slug: 'casa-no-autorizada' } })).toMatchObject({ isAuthorized: false });

    await jobs.execute('sync:prematch-odds');
    expect(await ctx.prisma.oddsSnapshot.count()).toBe(snaps1);

    ctx.routes([], [ODDS2]);
    await jobs.execute('sync:prematch-odds');
    const snaps3 = await ctx.prisma.oddsSnapshot.count();
    expect(snaps3).toBe(snaps1 + 2); // casa_uno cambió 1X2 local y AH local
    const quote = await ctx.prisma.oddsQuote.findFirst({ where: { bookmaker: { slug: 'casa-uno' }, marketKey: '1X2', selectionKey: 'HOME', fixture: { homeTeam: { name: 'Club Alfa' } } } });
    expect(quote).toMatchObject({ openingPrice: 1.62, currentPrice: 1.7, previousPrice: 1.62 });
    expect(quote?.impliedProbabilityNoVig).toBeGreaterThan(0);
  });

  it('predicciones versionadas e idempotentes', async () => {
    const r1 = await jobs.execute('compute:predictions');
    expect(r1.created).toBe(3);
    const r2 = await jobs.execute('compute:predictions');
    expect(r2.created).toBe(0);
    const run = await ctx.prisma.predictionRun.findFirst({ where: { status: 'COMPLETED' }, include: { probabilities: true } });
    expect(run?.modelVersion).toMatch(/^football-ensemble-/);
    expect(run!.dataCutoff.getTime()).toBeLessThanOrEqual(Date.now());
    const oneXTwo = run!.probabilities.filter((p) => p.marketKey === '1X2');
    expect(oneXTwo.reduce((s, p) => s + p.rawProbability, 0)).toBeCloseTo(1, 2);
  });

  it('oportunidades ordenadas por calidad con todos los campos requeridos', async () => {
    const candidates = await ctx.app.get(ValueBetsService).evaluateRun((await ctx.prisma.predictionRun.findFirstOrThrow({ where: { status: 'COMPLETED' } })).id);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.bookmakerCount >= 1 && c.marketProbability > 0)).toBe(true);
    await jobs.execute('compute:value-bets');
    const res = await request(server()).get('/api/v1/value-bets').expect(200);
    const items = res.body.data.items;
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) expect(items[i - 1].qualityScore).toBeGreaterThanOrEqual(items[i].qualityScore);
    const vb = items[0];
    for (const key of ['price', 'bookmakerSlug', 'probability', 'marketProbability', 'fairOdds', 'edge', 'expectedValue', 'confidence', 'freshnessScore', 'comparison', 'risks', 'explanation']) expect(vb).toHaveProperty(key);
    expect(vb.comparison.every((c: { bookmaker: { slug: string } }) => c.bookmaker.slug !== 'casa-no-autorizada')).toBe(true);
    // Recalcular no duplica oportunidades.
    const count = await ctx.prisma.valueBet.count();
    await jobs.execute('compute:value-bets');
    expect(await ctx.prisma.valueBet.count()).toBe(count);
  });

  it('comparador: mejor cuota, diferencia vs promedio y arbitraje matemático', async () => {
    const beta = await ctx.prisma.fixture.findFirstOrThrow({ where: { homeTeam: { name: 'Deportivo Beta' }, status: 'SCHEDULED' } });
    const res = await request(server()).get(`/api/v1/fixtures/${beta.id}/odds`).expect(200);
    const ou = res.body.data.markets.find((m: { marketKey: string; lineKey: string }) => m.marketKey === 'OU_GOALS' && m.lineKey === '2.5');
    expect(ou.arbitrage.isArbitrage).toBe(true);
    expect(ou.arbitrage.warning).toMatch(/pueden cambiar/);
    const home = res.body.data.markets.find((m: { marketKey: string }) => m.marketKey === '1X2').selections.find((s: { selectionKey: string }) => s.selectionKey === 'HOME');
    expect(home.best.price).toBe(2.3);
    expect(home.quotes[0].diffVsAverage).toBeGreaterThan(0);
    const history = await request(server()).get(`/api/v1/fixtures/${beta.id}/odds-history?market=1X2`).expect(200);
    expect(history.body.data.series.length).toBeGreaterThan(0);
  });

  it('endpoints públicos: calendario, detalle y predicciones', async () => {
    const list = await request(server()).get('/api/v1/fixtures?date=week').expect(200);
    expect(list.body.data.items.length).toBe(3);
    const id = list.body.data.items[0].id;
    const detail = await request(server()).get(`/api/v1/fixtures/${id}`).expect(200);
    expect(detail.body.data.form.home.length).toBeGreaterThan(0);
    expect(detail.body.data.standings).toHaveLength(6);
    const pred = await request(server()).get(`/api/v1/fixtures/${id}/predictions`).expect(200);
    expect(pred.body.data.available).toBe(true);
    expect(pred.body.data.markets.length).toBeGreaterThan(3);
  });

  it('resultados, liquidación e historial auditable', async () => {
    const alfa = await ctx.prisma.fixture.findFirstOrThrow({ where: { homeTeam: { name: 'Club Alfa' }, status: 'SCHEDULED' } });
    // Simula el paso del tiempo: el partido ya empezó y el proveedor reporta el final.
    await ctx.prisma.fixture.update({ where: { id: alfa.id }, data: { kickoff: new Date(Date.now() - 3 * 3600_000) } });
    ctx.routes([AF.result]);
    await jobs.execute('sync:results');
    const after = await ctx.prisma.fixture.findUniqueOrThrow({ where: { id: alfa.id } });
    expect(after).toMatchObject({ status: 'FINISHED', homeScore: 2, awayScore: 0 });
    await ctx.prisma.fixture.update({ where: { id: alfa.id }, data: { kickoff: new Date(Date.now() - 3 * 3600_000) } });
    const r = await jobs.execute('sync:settlements');
    expect(r.status).toBe('SUCCEEDED');
    const settledProbs = await ctx.prisma.calculatedProbability.count({ where: { outcome: { not: null }, predictionRun: { fixtureId: alfa.id } } });
    expect(settledProbs).toBeGreaterThan(10);
    const home = await ctx.prisma.calculatedProbability.findFirst({ where: { marketKey: '1X2', selectionKey: 'HOME', predictionRun: { fixtureId: alfa.id } } });
    expect(home?.outcome).toBe('WIN');
    const track = await request(server()).get('/api/v1/track-record').expect(200);
    expect(track.body.data.summary.counts.total).toBeGreaterThan(0);
    const alfaBets = await ctx.prisma.valueBet.findMany({ where: { fixtureId: alfa.id } });
    expect(alfaBets.every((b) => b.result != null && b.profitLossUnits != null)).toBe(true);
  });

  it('backtest walk-forward, calibración y métricas', async () => {
    const r = await jobs.execute('compute:model-metrics');
    expect(r.status).toBe('SUCCEEDED');
    expect(await ctx.prisma.predictionRun.count({ where: { status: 'BACKTEST' } })).toBeGreaterThan(30);
    const snap = await ctx.prisma.modelMetricSnapshot.findFirst({ where: { source: 'backtest', marketKey: '1X2', leagueId: '' } });
    expect(snap?.brier).toBeGreaterThan(0);
    expect(snap?.ece).not.toBeNull();
    // Con < CALIBRATION_MIN_SAMPLES el mercado no se publica.
    expect(snap?.isPublishable).toBe(false);
    const metrics = await request(server()).get('/api/v1/model-metrics').expect(200);
    expect(metrics.body.data.snapshots.length).toBeGreaterThan(0);
    // Re-ejecutar no duplica corridas de backtest.
    const before = await ctx.prisma.predictionRun.count({ where: { status: 'BACKTEST' } });
    await jobs.execute('compute:model-metrics');
    expect(await ctx.prisma.predictionRun.count({ where: { status: 'BACKTEST' } })).toBe(before);
  });

  it('estado de datos honesto', async () => {
    const res = await request(server()).get('/api/v1/data-status').expect(200);
    expect(res.body.data.providers.find((p: { provider: string }) => p.provider === 'API_FOOTBALL').configured).toBe(true);
    expect(res.body.data.jobs.length).toBeGreaterThan(3);
    expect(JSON.stringify(res.body)).not.toContain('test-af');
  });
});
