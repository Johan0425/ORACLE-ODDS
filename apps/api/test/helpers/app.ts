import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { env, resetEnvCache } from '../../src/config/env';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProviderRegistry } from '../../src/providers/providers.module';
import { QuotaService } from '../../src/providers/quota.service';
import { ApiFootballAdapter } from '../../src/providers/api-football/api-football.adapter';
import { OddsApiAdapter } from '../../src/providers/the-odds-api/odds-api.adapter';
import { OddsApiIoAdapter } from '../../src/providers/odds-api-io/odds-api-io.adapter';
import { recordedFetch, type Route } from './recorded';

export const TEST_ENV_KEYS = [
  'API_FOOTBALL_KEY',
  'THE_ODDS_API_KEY',
  'ODDS_API_IO_KEY',
  'ENABLE_ODDS_API_IO',
  'TRACKED_LEAGUES',
  'API_FOOTBALL_SEASON',
  'API_FOOTBALL_PER_MINUTE',
  'THE_ODDS_API_MONTHLY_LIMIT',
  'ODDS_SPORT_KEYS',
  'ALLOWED_BOOKMAKERS',
  'PUBLISH_REQUIRE_CALIBRATION',
  'VALUE_MIN_EDGE',
  'VALUE_MIN_EV',
  'VALUE_MIN_QUALITY',
  'VALUE_MIN_BOOKMAKERS',
  'VALUE_MIN_CONFIDENCE',
  'SYNC_ADMIN_SECRET',
  'BET_SANTANDER_ENABLED',
  'BET_SANTANDER_URL',
  'BET_SANTANDER_AFFILIATE_ID',
  'BET_SANTANDER_VERIFIED_AT',
  'CHALLENGE_DAILY_CREATE_LIMIT',
];

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  providers: ProviderRegistry;
  /** Sustituye las respuestas de los proveedores para los próximos jobs. */
  routes(apiFootball: Route[], theOddsApi?: Route[], oddsApiIo?: Route[]): void;
  close(): Promise<void>;
}

export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestContext> {
  for (const k of TEST_ENV_KEYS) delete process.env[k];
  Object.assign(process.env, overrides);
  resetEnvCache();
  const { AppModule } = await import('../../src/app.module');
  const { configureApp } = await import('../../src/common/configure-app');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app, env());
  await app.init();
  const providers = app.get(ProviderRegistry);
  const quota = app.get(QuotaService);
  const ctx: TestContext = {
    app,
    prisma: app.get(PrismaService),
    providers,
    routes(af, odds = [], io = []) {
      const e = env();
      const p = providers as unknown as Record<string, unknown>;
      p.apiFootball = new ApiFootballAdapter(e, quota, recordedFetch(af).fetch);
      p.oddsApi = new OddsApiAdapter(e, quota, recordedFetch(odds).fetch);
      p.oddsApiIo = new OddsApiIoAdapter(e, quota, recordedFetch(io).fetch);
    },
    close: () => app.close(),
  };
  return ctx;
}

/** Vacía todas las tablas de la base de pruebas (menos el historial de migraciones). */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
