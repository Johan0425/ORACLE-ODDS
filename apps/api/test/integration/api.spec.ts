import request from 'supertest';
import { createTestApp, resetDatabase, type TestContext } from '../helpers/app';
import { SyncJobsService } from '../../src/modules/sync/sync-jobs.service';
import type { Route } from '../helpers/recorded';

jest.setTimeout(120_000);

const ADMIN = 'admin-secret-for-tests-0123456789';

describe('API sin proveedores configurados', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ SYNC_ADMIN_SECRET: ADMIN });
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => ctx.close());

  it('health y ready', async () => {
    await request(ctx.app.getHttpServer()).get('/health').expect(200);
    const ready = await request(ctx.app.getHttpServer()).get('/ready').expect(200);
    expect(ready.body.data.checks.database).toBe('ok');
  });

  it('muestra un estado honesto y no inventa partidos', async () => {
    const status = await request(ctx.app.getHttpServer()).get('/api/v1/data-status').expect(200);
    expect(status.body.data.overall).toBe('NOT_CONFIGURED');
    const fixtures = await request(ctx.app.getHttpServer()).get('/api/v1/fixtures').expect(200);
    expect(fixtures.body.data.items).toEqual([]);
    const vb = await request(ctx.app.getHttpServer()).get('/api/v1/value-bets').expect(200);
    expect(vb.body.data.items).toEqual([]);
  });

  it('los jobs sin credenciales se omiten con motivo explícito', async () => {
    const r = await ctx.app.get(SyncJobsService).execute('sync:upcoming-fixtures');
    expect(r).toMatchObject({ status: 'SKIPPED', reason: expect.stringContaining('PROVIDER_NOT_CONFIGURED') });
  });

  it('protege la administración con SYNC_ADMIN_SECRET y audita', async () => {
    await request(ctx.app.getHttpServer()).post('/api/v1/admin/sync').send({ job: 'sync:sports-catalog' }).expect(403);
    await request(ctx.app.getHttpServer()).post('/api/v1/admin/sync').set('x-admin-secret', 'wrong').send({ job: 'sync:sports-catalog' }).expect(403);
    const ok = await request(ctx.app.getHttpServer()).post('/api/v1/admin/sync').set('x-admin-secret', ADMIN).send({ job: 'sync:sports-catalog', inline: true }).expect(201);
    expect(ok.body.data.result.status).toBe('SUCCEEDED');
    expect(await ctx.prisma.adminAuditLog.count()).toBe(1);
    const audit = await ctx.prisma.adminAuditLog.findFirst();
    expect(JSON.stringify(audit)).not.toContain(ADMIN);
  });

  it('valida entradas y no filtra detalles internos', async () => {
    const bad = await request(ctx.app.getHttpServer()).post('/api/v1/admin/sync').set('x-admin-secret', ADMIN).send({ job: 'rm -rf' }).expect(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
    expect(bad.body.error.requestId).toBeTruthy();
    await request(ctx.app.getHttpServer()).post('/api/v1/combinations/analyze').send({ legs: [], hack: true }).expect(400);
    await request(ctx.app.getHttpServer()).get('/api/v1/fixtures/no-existe').expect(404);
  });

  it('cabeceras de seguridad y CORS', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('patrocinio desactivado por defecto: sin enlace comercial', async () => {
    const cfg = await request(ctx.app.getHttpServer()).get('/api/v1/sponsor/config?placement=landing').expect(200);
    expect(cfg.body.data.enabled).toBe(false);
    await request(ctx.app.getHttpServer()).post('/api/v1/affiliate/click').send({ bookmaker: 'betsantander', placement: 'landing' }).expect(403);
  });
});

describe('flujos públicos con datos', () => {
  let ctx: TestContext;
  const server = () => ctx.app.getHttpServer();
  let fixtureIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp({
      API_FOOTBALL_KEY: 'k',
      THE_ODDS_API_KEY: 'k',
      TRACKED_LEAGUES: '9001',
      API_FOOTBALL_SEASON: '2026',
      API_FOOTBALL_PER_MINUTE: '100000',
      THE_ODDS_API_MONTHLY_LIMIT: '1000000',
      ODDS_SPORT_KEYS: 'soccer_testland_liga',
      ALLOWED_BOOKMAKERS: 'casa_uno,casa_dos,casa_tres',
      PUBLISH_REQUIRE_CALIBRATION: 'false',
      BET_SANTANDER_ENABLED: 'true',
      BET_SANTANDER_URL: 'https://www.betsantander.com/',
      BET_SANTANDER_AFFILIATE_ID: 'AFF-TEST',
      CHALLENGE_DAILY_CREATE_LIMIT: '3',
    });
    await resetDatabase(ctx.prisma);
    const jobs = ctx.app.get(SyncJobsService);
    const af: Route[] = [
      { match: /\/fixtures\?.*from=/, file: 'api-football/fixtures-history.json' },
    ];
    ctx.routes(af);
    await jobs.execute('sync:historical-fixtures');
    ctx.routes([{ match: /\/fixtures\?.*from=/, file: 'api-football/fixtures-upcoming.json' }], [{ match: /\/odds/, file: 'the-odds-api/odds-1.json' }]);
    await jobs.execute('sync:upcoming-fixtures');
    await jobs.execute('sync:prematch-odds');
    await jobs.execute('compute:predictions');
    fixtureIds = (await ctx.prisma.fixture.findMany({ where: { status: 'SCHEDULED' }, orderBy: { kickoff: 'asc' } })).map((f) => f.id);
  });
  afterAll(async () => ctx.close());

  it('combinadas: cuota total, probabilidad conjunta, correlación y bloqueo de contradicciones', async () => {
    const [a, b] = fixtureIds;
    const ok = await request(server())
      .post('/api/v1/combinations/analyze')
      .send({ legs: [{ fixtureId: a, marketKey: '1X2', selectionKey: 'HOME' }, { fixtureId: b, marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 2.5 }], systemSizes: [], save: true })
      .expect(201);
    const d = ok.body.data;
    expect(d.analysis.blocked).toBe(false);
    expect(d.analysis.combinedOdds).toBeCloseTo(d.legs[0].odds * d.legs[1].odds, 1);
    expect(d.legs.every((l: { oddsRefreshed: boolean }) => l.oddsRefreshed)).toBe(true);
    expect(d.publicCode).toMatch(/^[A-Z2-9]{8}$/);
    const same = await request(server())
      .post('/api/v1/combinations/analyze')
      .send({ legs: [{ fixtureId: a, marketKey: '1X2', selectionKey: 'HOME' }, { fixtureId: a, marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 2.5 }] })
      .expect(201);
    expect(same.body.data.analysis.issues.some((i: { code: string }) => i.code === 'SAME_FIXTURE_CORRELATION')).toBe(true);
    expect(same.body.data.analysis.adjustedProbability).not.toBeCloseTo(same.body.data.analysis.naiveProbability, 6);
    const contradictory = await request(server())
      .post('/api/v1/combinations/analyze')
      .send({ legs: [{ fixtureId: a, marketKey: '1X2', selectionKey: 'HOME' }, { fixtureId: a, marketKey: '1X2', selectionKey: 'AWAY' }] })
      .expect(201);
    expect(contradictory.body.data.analysis.blocked).toBe(true);
    const system = await request(server())
      .post('/api/v1/combinations/analyze')
      .send({ legs: fixtureIds.slice(0, 3).map((id) => ({ fixtureId: id, marketKey: '1X2', selectionKey: 'HOME', odds: 2.1 })), systemSizes: [2], stakeUnits: 3 })
      .expect(201);
    expect(system.body.data.systems[0]).toMatchObject({ name: '2/3', combinations: 3, stakePerCombination: 1 });
  });

  it('compartir: snapshot con cuota vigente, texto con avisos y QR/enlace corto', async () => {
    const res = await request(server()).post('/api/v1/share-assets').send({ entityType: 'fixture', entityId: fixtureIds[0], format: 'square', showSponsor: true }).expect(201);
    const share = res.body.data;
    expect(share.shareText).toContain('Cuotas sujetas a cambios');
    expect(share.shareText).toContain('Solo mayores de 18 años');
    expect(share.shareText).toContain('no garantía');
    expect(share.sponsor?.label).toBe('En colaboración con BetSantander');
    const got = await request(server()).get(`/api/v1/share/${share.publicCode}`).expect(200);
    expect(got.body.data.publicCode).toBe(share.publicCode);
  });

  it('retos anónimos: crear, unirse, picks bloqueados al inicio, clasificación y moderación', async () => {
    const created = await request(server())
      .post('/api/v1/challenges')
      .send({ title: 'Reto de la oficina', fixtureIds: fixtureIds.slice(0, 2), scoring: { system: 'simple', format: 'one_off', allowedMarkets: ['1X2', 'OU_GOALS'] } })
      .expect(201);
    const { publicCode, creatorSecret } = created.body.data;
    expect(creatorSecret).toBeTruthy();
    const stored = await ctx.prisma.anonymousChallenge.findUniqueOrThrow({ where: { publicCode } });
    expect(stored.creatorSecretHash).not.toBe(creatorSecret);

    await request(server()).post('/api/v1/challenges').send({ title: 'Premio en dinero $100', fixtureIds: fixtureIds.slice(0, 1), scoring: { system: 'simple', format: 'one_off', allowedMarkets: ['1X2'] } }).expect(400);

    const join = await request(server()).post(`/api/v1/challenges/${publicCode}/join`).send({ alias: 'Tigre_23' }).expect(201);
    const token = join.body.data.participantToken;
    await request(server()).post(`/api/v1/challenges/${publicCode}/join`).send({ alias: 'Tigre_23' }).expect(409);
    await request(server()).post(`/api/v1/challenges/${publicCode}/join`).send({ alias: 'mierda' }).expect(400);

    await request(server())
      .post(`/api/v1/challenges/${publicCode}/picks`)
      .set('x-participant-token', token)
      .send({ picks: [{ fixtureId: fixtureIds[0], marketKey: '1X2', selectionKey: 'HOME' }] })
      .expect(201);
    await request(server()).post(`/api/v1/challenges/${publicCode}/picks`).set('x-participant-token', 'bad').send({ picks: [] }).expect(403);
    await request(server())
      .post(`/api/v1/challenges/${publicCode}/picks`)
      .set('x-participant-token', token)
      .send({ picks: [{ fixtureId: fixtureIds[0], marketKey: 'BTTS', selectionKey: 'YES' }] })
      .expect(400);

    // El partido empieza: la selección queda bloqueada y visible para todos.
    await ctx.prisma.fixture.update({ where: { id: fixtureIds[0] }, data: { kickoff: new Date(Date.now() - 60_000) } });
    await request(server())
      .post(`/api/v1/challenges/${publicCode}/picks`)
      .set('x-participant-token', token)
      .send({ picks: [{ fixtureId: fixtureIds[0], marketKey: '1X2', selectionKey: 'AWAY' }] })
      .expect(400);
    const board = await request(server()).get(`/api/v1/challenges/${publicCode}/leaderboard`).expect(200);
    expect(board.body.data.entries[0]).toMatchObject({ alias: 'Tigre_23', rank: 1 });
    expect(board.body.data.entries[0].picks).toHaveLength(1);

    // Resultado y liquidación automática.
    await ctx.prisma.fixture.update({ where: { id: fixtureIds[0] }, data: { status: 'FINISHED', homeScore: 2, awayScore: 0 } });
    await ctx.app.get(SyncJobsService).execute('sync:settlements');
    const scored = await request(server()).get(`/api/v1/challenges/${publicCode}/leaderboard`).expect(200);
    expect(scored.body.data.entries[0].score).toBe(1);

    await request(server()).post(`/api/v1/challenges/${publicCode}/moderate`).set('x-creator-secret', 'wrong').send({ alias: 'Tigre_23', hidden: true }).expect(403);
    await request(server()).post(`/api/v1/challenges/${publicCode}/moderate`).set('x-creator-secret', creatorSecret).send({ alias: 'Tigre_23', hidden: true }).expect(201);
    const hidden = await request(server()).get(`/api/v1/challenges/${publicCode}/leaderboard`).expect(200);
    expect(hidden.body.data.entries).toHaveLength(0);
    await request(server()).post(`/api/v1/challenges/${publicCode}/close`).set('x-creator-secret', creatorSecret).expect(201);
    expect(await ctx.prisma.challengeAuditLog.count({ where: { challengeId: stored.id } })).toBeGreaterThanOrEqual(4);
    const detail = await request(server()).get(`/api/v1/challenges/${publicCode}`).expect(200);
    expect(detail.body.data).not.toHaveProperty('creatorSecretHash');
    expect(detail.body.data.disclaimer).toMatch(/sin dinero real/);
  });

  it('afiliación: clic server-side con UTM/subID/clickID, sin IP en claro, solo casas autorizadas', async () => {
    // En entorno de pruebas (no producción) el patrocinador se activa sin fecha de verificación.
    const click = await request(server())
      .post('/api/v1/affiliate/click')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ bookmaker: 'betsantander', placement: 'below_comparator', fixtureId: fixtureIds[1], utmSource: 'web' })
      .expect(201);
    const url = new URL(click.body.data.redirectUrl);
    expect(url.searchParams.get('aff')).toBe('AFF-TEST');
    expect(url.searchParams.get('subid')).toBe('below_comparator');
    const row = await ctx.prisma.affiliateClick.findUniqueOrThrow({ where: { clickId: click.body.data.clickId } });
    expect(JSON.stringify(row)).not.toContain('203.0.113.9');
    await request(server()).post('/api/v1/affiliate/click').send({ bookmaker: 'casa-no-autorizada', placement: 'comparator' }).expect(404);
    await request(server()).get(`/api/v1/affiliate/go?bookmaker=betsantander&placement=landing`).expect(302);
    await request(server()).post('/api/v1/affiliate/impression').send({ placement: 'landing', bookmaker: 'betsantander' }).expect(204);
    await request(server()).post('/api/v1/affiliate/postback').send({ clickId: 'x', event: 'ftd', externalRef: 'r1' }).expect(404);
  });

  it('catálogo público y OpenAPI', async () => {
    const leagues = await request(server()).get('/api/v1/leagues').expect(200);
    expect(leagues.body.data[0].name).toBe('Liga de Prueba');
    const books = await request(server()).get('/api/v1/bookmakers').expect(200);
    expect(books.body.data.map((b: { slug: string }) => b.slug).sort()).toEqual(['casa-dos', 'casa-tres', 'casa-uno']);
    const doc = await request(server()).get('/api/docs/openapi.json').expect(200);
    expect(Object.keys(doc.body.paths)).toEqual(expect.arrayContaining(['/api/v1/value-bets', '/api/v1/challenges/{code}/join', '/api/v1/admin/sync']));
  });
});
