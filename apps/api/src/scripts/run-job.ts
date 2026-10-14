import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { env, loadDotEnv } from '../config/env';
import { appLogger } from '../common/logger';

/**
 * Ejecuta jobs del pipeline una vez, sin Redis/BullMQ (operación manual,
 * desarrollo local, cron externo). Uso:
 *   npm run job -w apps/api -- sync:upcoming-fixtures compute:predictions
 *   npm run job -w apps/api -- all
 */
async function main() {
  loadDotEnv();
  env();
  const { CoreModule } = await import('../modules/core/core.module');
  const { SyncJobsService, JOB_NAMES, isJobName } = await import('../modules/sync/sync-jobs.service');
  const args = process.argv.slice(2);
  for (const a of args) if (a !== 'all' && !isJobName(a)) throw new Error(`Job desconocido: ${a}. Disponibles: ${JOB_NAMES.join(', ')}`);
  const jobs = args.includes('all') ? JOB_NAMES.filter((j) => j !== 'export:social-card') : args.filter(isJobName);
  if (jobs.length === 0) throw new Error(`Indica uno o más jobs: ${JOB_NAMES.join(', ')}`);
  const app = await NestFactory.createApplicationContext(CoreModule, { logger: appLogger });
  const runner = app.get(SyncJobsService);
  let failed = false;
  for (const job of jobs) {
    try {
      const r = await runner.execute(job);
      process.stdout.write(`${job}: ${r.status}${r.reason ? ` (${r.reason})` : ''}\n`);
    } catch (e) {
      failed = true;
      process.stdout.write(`${job}: FAILED (${(e as Error).message})\n`);
    }
  }
  await app.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
});
