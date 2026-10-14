import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const num = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v == null || v === '') return fallback;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `número inválido: ${v}` });
        return z.NEVER;
      }
      return n;
    });

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optionalUrl = optionalString.refine((v) => v == null || /^https?:\/\//.test(v), 'debe ser una URL http(s)');

/**
 * Esquema único de variables de entorno. Se valida al arrancar la API y el
 * worker: un valor mal formado detiene el proceso con un mensaje claro en vez
 * de fallar más tarde en tiempo de ejecución. Las claves de proveedores son
 * opcionales: sin ellas el producto muestra un estado de configuración honesto.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: num(3001),
    PROCESS_ROLE: z.enum(['api', 'worker', 'all']).default('api'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
    DATABASE_URL_UNPOOLED: optionalString,
    REDIS_URL: optionalString,
    REDIS_HOST: optionalString,
    REDIS_PORT: num(6379),

    CORS_ORIGIN: csv,
    PUBLIC_WEB_URL: optionalUrl,
    TRUST_PROXY: bool(true),
    METRICS_TOKEN: optionalString,
    /** Token compartido con el frontend (SSR): sus llamadas servidor→API no consumen el rate limit por IP. */
    INTERNAL_API_TOKEN: optionalString,
    THROTTLE_GLOBAL_LIMIT: num(120),
    SENTRY_DSN: optionalString,

    ENABLE_SYNC_WORKER: bool(false),
    SYNC_ADMIN_SECRET: optionalString,
    /** Sal para hashes de sesión anónima; se rota cada día combinándola con la fecha. */
    ANON_HASH_SALT: optionalString,

    DEFAULT_TIMEZONE: z.string().default('America/Bogota'),
    DEFAULT_LOCALE: z.string().default('es-CO'),
    DEFAULT_REGION: z.string().default('co'),

    API_FOOTBALL_KEY: optionalString,
    API_FOOTBALL_BASE_URL: z.string().url().default('https://v3.football.api-sports.io'),
    API_FOOTBALL_DAILY_LIMIT: num(100),
    API_FOOTBALL_PER_MINUTE: num(10),
    /** IDs de liga de API-Football a sincronizar. */
    TRACKED_LEAGUES: csv,
    /** Temporada de API-Football (año de inicio). Vacío = temporada vigente reportada por el proveedor. */
    API_FOOTBALL_SEASON: optionalString,
    ENABLE_API_FOOTBALL_ODDS: bool(false),

    THE_ODDS_API_KEY: optionalString,
    THE_ODDS_API_BASE_URL: z.string().url().default('https://api.the-odds-api.com'),
    THE_ODDS_API_MONTHLY_LIMIT: num(500),
    ODDS_REGIONS: z.string().default('eu,uk'),
    ODDS_MARKETS: z.string().default('h2h,totals,spreads'),
    /** sport_keys de The Odds API a sincronizar. */
    ODDS_SPORT_KEYS: csv,
    ENABLE_HISTORICAL_ODDS: bool(false),

    ODDS_API_IO_KEY: optionalString,
    ENABLE_ODDS_API_IO: bool(false),
    ODDS_API_IO_BASE_URL: z.string().url().default('https://api.odds-api.io/v3'),
    /** Competiciones de odds-api.io con formato `deporte:liga` (p. ej. football:england-premier-league). */
    ODDS_API_IO_COMPETITIONS: csv,

    THESPORTSDB_KEY: optionalString,

    /** Slugs de casas verificadas como autorizadas para el territorio. Vacío = ninguna se marca autorizada. */
    ALLOWED_BOOKMAKERS: csv,
    VIG_METHOD: z.enum(['proportional', 'power', 'shin']).default('power'),

    FIXTURE_MATCH_TOLERANCE_MINUTES: num(90),
    PREMATCH_ODDS_STALE_SECONDS: num(2 * 60 * 60),
    LIVE_ODDS_STALE_SECONDS: num(120),
    LIVE_MAX_LATENCY_SECONDS: num(90),
    ENABLE_LIVE_PICKS: bool(false),

    VALUE_MIN_EDGE: num(0.02),
    VALUE_MIN_EV: num(0.02),
    VALUE_MIN_QUALITY: num(55),
    VALUE_MIN_BOOKMAKERS: num(2),
    VALUE_MIN_CONFIDENCE: num(0.35),
    VALUE_MAX_ODDS: num(10),
    PUBLISH_REQUIRE_CALIBRATION: bool(true),
    CALIBRATION_MIN_SAMPLES: num(300),
    CALIBRATION_MAX_ECE: num(0.05),

    SYNC_CATALOG_EVERY_MS: num(24 * 60 * 60 * 1000),
    SYNC_UPCOMING_EVERY_MS: num(45 * 60 * 1000),
    SYNC_PREMATCH_ODDS_EVERY_MS: num(10 * 60 * 1000),
    SYNC_LIVE_EVERY_MS: num(30 * 1000),
    SYNC_LIVE_ODDS_EVERY_MS: num(60 * 1000),
    SYNC_RESULTS_EVERY_MS: num(3 * 60 * 1000),
    SYNC_DETAILS_EVERY_MS: num(60 * 60 * 1000),
    SYNC_HISTORICAL_CRON: z.string().default('0 3 * * *'),
    COMPUTE_PREDICTIONS_EVERY_MS: num(30 * 60 * 1000),
    COMPUTE_VALUE_BETS_EVERY_MS: num(10 * 60 * 1000),
    COMPUTE_METRICS_CRON: z.string().default('30 4 * * *'),

    BET_SANTANDER_ENABLED: bool(false),
    BET_SANTANDER_URL: optionalUrl,
    BET_SANTANDER_AFFILIATE_ID: optionalString,
    BET_SANTANDER_CAMPAIGN: optionalString,
    BET_SANTANDER_LOGO_URL: optionalUrl,
    /** Fecha (ISO) en que se verificó licencia, operador y acuerdo. Obligatoria para activar en producción. */
    BET_SANTANDER_VERIFIED_AT: optionalString,
    BET_SANTANDER_LICENSE_LABEL: optionalString,
    BET_SANTANDER_ALLOWED_COUNTRIES: z.string().default('CO'),
    BET_SANTANDER_STARTS_AT: optionalString,
    BET_SANTANDER_ENDS_AT: optionalString,
    BET_SANTANDER_PLACEMENTS: z.string().default('hero_secondary,below_comparator,bet_slip,landing,share_footer,challenge_sponsor,post_analysis'),
    BET_SANTANDER_FREQUENCY_CAP: num(3),
    BET_SANTANDER_SHOW_ON_SHARES: bool(true),
    BET_SANTANDER_POSTBACK_SECRET: optionalString,
    /** Nombres de parámetros del enlace de afiliado: confirmar con la documentación del operador. */
    BET_SANTANDER_AFFILIATE_PARAM: z.string().default('aff'),
    BET_SANTANDER_SUBID_PARAM: z.string().default('subid'),
    BET_SANTANDER_CLICKID_PARAM: z.string().default('clickid'),

    /** Cloudflare Turnstile: si se define, se exige CAPTCHA cuando se detecta abuso en retos. */
    TURNSTILE_SECRET_KEY: optionalString,
    CHALLENGE_DAILY_CREATE_LIMIT: num(5),
    CHALLENGE_BLOCKLIST: csv,

    TELEGRAM_BOT_TOKEN: optionalString,
    TELEGRAM_CHANNEL_ID: optionalString,
    ENABLE_TELEGRAM_PUBLISH: bool(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.SYNC_ADMIN_SECRET || env.SYNC_ADMIN_SECRET.length < 24) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SYNC_ADMIN_SECRET'], message: 'obligatorio en producción (≥ 24 caracteres)' });
      }
      if (env.PROCESS_ROLE !== 'worker' && env.CORS_ORIGIN.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGIN'], message: 'obligatorio en producción (allowlist explícita)' });
      }
      if (!env.ANON_HASH_SALT || env.ANON_HASH_SALT.length < 16) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ANON_HASH_SALT'], message: 'obligatorio en producción (≥ 16 caracteres)' });
      }
    }
    if (env.ENABLE_SYNC_WORKER && !env.REDIS_URL && !env.REDIS_HOST) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['REDIS_URL'], message: 'el worker requiere REDIS_URL o REDIS_HOST' });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {}

export function parseEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`).join('\n');
    throw new EnvValidationError(`Variables de entorno inválidas:\n${issues}`);
  }
  return result.data;
}

let cached: AppEnv | null = null;

/** Configuración validada (memoizada). Los tests pueden reiniciarla con `resetEnvCache`. */
export function env(): AppEnv {
  if (!cached) cached = parseEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export function providerConfigured(e: AppEnv) {
  return {
    apiFootball: !!e.API_FOOTBALL_KEY,
    theOddsApi: !!e.THE_ODDS_API_KEY,
    oddsApiIo: !!e.ODDS_API_IO_KEY && e.ENABLE_ODDS_API_IO,
    theSportsDb: !!e.THESPORTSDB_KEY,
    redis: !!(e.REDIS_URL || e.REDIS_HOST),
  };
}

/**
 * Carga `.env` del directorio actual si existe (desarrollo local). No pisa
 * variables ya definidas: en producción mandan las de la plataforma.
 */
export function loadDotEnv(file = '.env'): void {
  try {
    (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(file);
  } catch {
    /* sin archivo .env: se usan solo las variables del proceso */
  }
}
