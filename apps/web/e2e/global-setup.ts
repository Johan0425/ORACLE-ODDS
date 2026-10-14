import { execSync } from 'node:child_process';
import { join } from 'node:path';

/** Reconstruye la base E2E y carga el escenario grabado a través del pipeline real. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return;
  const url = process.env.E2E_DATABASE_URL ?? 'postgresql://oracle:oracle@localhost:5432/oracle_odds_e2e?schema=public';
  execSync('npx jest --selectProjects e2e-seed --runInBand', {
    cwd: join(__dirname, '..', '..', 'api'),
    env: { ...process.env, TEST_DATABASE_URL: url },
    stdio: 'inherit',
  });
}
