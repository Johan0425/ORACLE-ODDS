// Las pruebas de integración usan SIEMPRE una base de datos dedicada y nunca claves reales.
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://oracle:oracle@localhost:5432/oracle_odds_test?schema=public';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DATABASE_URL_UNPOOLED = url;
process.env.LOG_LEVEL = 'error';
for (const k of ['API_FOOTBALL_KEY', 'THE_ODDS_API_KEY', 'ODDS_API_IO_KEY', 'THESPORTSDB_KEY', 'REDIS_URL', 'REDIS_HOST', 'TELEGRAM_BOT_TOKEN']) delete process.env[k];
