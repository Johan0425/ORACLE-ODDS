import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra un stack local aislado: API (puerto 3201) sobre la base
 * `oracle_odds_e2e`, cargada con respuestas grabadas de proveedores SOLO para
 * pruebas (apps/api/test/fixtures). Ninguna prueba depende de APIs externas.
 * Para verificar datos reales en un entorno con credenciales: E2E_REAL_BASE_URL.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://oracle:oracle@localhost:5432/oracle_odds_e2e?schema=public';
const API = 'http://localhost:3201/api/v1';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3200', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'es-CO', timezoneId: 'America/Bogota' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://localhost:3201/health',
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'development',
        PORT: '3201',
        DATABASE_URL: E2E_DB,
        DATABASE_URL_UNPOOLED: E2E_DB,
        CORS_ORIGIN: 'http://localhost:3200',
        PUBLISH_REQUIRE_CALIBRATION: 'false',
        PUBLIC_WEB_URL: 'http://localhost:3200',
        BET_SANTANDER_ENABLED: 'true',
        BET_SANTANDER_URL: 'https://www.betsantander.com/',
        SYNC_ADMIN_SECRET: 'e2e-admin-secret-0123456789abcdef',
        ENABLE_SYNC_WORKER: 'false',
        INTERNAL_API_TOKEN: 'e2e-internal-token-0123456789',
        THROTTLE_GLOBAL_LIMIT: '600',
        REDIS_URL: '',
        REDIS_HOST: '',
        API_FOOTBALL_KEY: '',
        THE_ODDS_API_KEY: '',
      },
    },
    {
      command: 'npx next build && npx next start -p 3200',
      url: 'http://localhost:3200',
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: { NEXT_PUBLIC_API_URL: API, API_URL: API, NEXT_PUBLIC_SITE_URL: 'http://localhost:3200', INTERNAL_API_TOKEN: 'e2e-internal-token-0123456789' },
    },
  ],
});
