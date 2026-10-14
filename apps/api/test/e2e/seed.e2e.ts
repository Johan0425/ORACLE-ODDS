import { createTestApp, resetDatabase } from '../helpers/app';
import { SyncJobsService } from '../../src/modules/sync/sync-jobs.service';

/**
 * Carga datos SOLO para la base de pruebas E2E (TEST_DATABASE_URL): pasa las
 * respuestas grabadas de test/fixtures por el pipeline real (normalización,
 * cuotas, predicciones y oportunidades). Nunca se ejecuta contra desarrollo o
 * producción: el proyecto Jest "e2e-seed" fuerza NODE_ENV=test y una URL dedicada.
 */
jest.setTimeout(180_000);

it('carga el escenario E2E', async () => {
  const ctx = await createTestApp({
    API_FOOTBALL_KEY: 'recorded',
    THE_ODDS_API_KEY: 'recorded',
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
  const jobs = ctx.app.get(SyncJobsService);
  ctx.routes([{ match: /\/leagues\?/, file: 'api-football/leagues.json' }]);
  await jobs.execute('sync:sports-catalog');
  await jobs.execute('sync:leagues');
  ctx.routes([{ match: /\/fixtures\?.*from=/, file: 'api-football/fixtures-history.json' }]);
  await jobs.execute('sync:historical-fixtures');
  ctx.routes([
    { match: /\/fixtures\?.*from=/, file: 'api-football/fixtures-upcoming.json' },
    { match: /fixtures\/statistics\?fixture=500089/, file: 'api-football/statistics.json' },
    { match: /fixtures\/statistics/, body: { errors: [], response: [] } },
    { match: /fixtures\/events/, file: 'api-football/events.json' },
    { match: /injuries\?fixture=600001/, file: 'api-football/injuries.json' },
    { match: /injuries/, body: { errors: [], response: [] } },
    { match: /\/teams\?/, body: { errors: [], response: [] } },
    { match: /standings/, file: 'api-football/standings.json' },
    { match: /\/fixtures\?.*live=/, file: 'api-football/fixtures-live.json' },
  ], [{ match: /\/odds/, file: 'the-odds-api/odds-1.json' }]);
  for (const job of ['sync:upcoming-fixtures', 'sync:fixture-details', 'sync:injuries', 'sync:teams', 'sync:prematch-odds', 'compute:predictions', 'compute:value-bets', 'sync:live-fixtures'] as const) {
    await jobs.execute(job);
  }
  ctx.routes([], [{ match: /\/odds/, file: 'the-odds-api/odds-2.json' }]);
  await jobs.execute('sync:prematch-odds');
  expect(await ctx.prisma.valueBet.count()).toBeGreaterThan(0);
  expect(await ctx.prisma.fixture.count({ where: { status: 'LIVE' } })).toBe(1);
  await ctx.close();
});
