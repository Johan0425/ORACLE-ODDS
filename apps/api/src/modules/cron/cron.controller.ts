import { Controller, ForbiddenException, Get, Headers, Inject, NotFoundException, Param, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { safeEqual } from '../../common/hashing';
import { SyncJobsService, type JobName } from '../sync/sync-jobs.service';

/**
 * Grupos de jobs para entornos sin worker persistente (Vercel Functions). Cada
 * invocación ejecuta los jobs del grupo en orden hasta agotar el presupuesto
 * de tiempo; los que no alcancen corren en la siguiente invocación. No usa
 * BullMQ: los jobs son idempotentes y llevan lock y registro igual que en el worker.
 */
export const CRON_GROUPS: Record<string, JobName[]> = {
  daily: [
    'sync:sports-catalog',
    'sync:leagues',
    'sync:teams',
    'sync:historical-fixtures',
    'sync:upcoming-fixtures',
    'sync:fixture-details',
    'sync:injuries',
    'sync:prematch-odds',
    'sync:results',
    'sync:settlements',
    'compute:predictions',
    'compute:value-bets',
    'compute:model-metrics',
  ],
  odds: ['sync:upcoming-fixtures', 'sync:lineups', 'sync:prematch-odds', 'compute:predictions', 'compute:value-bets'],
  live: ['sync:live-fixtures', 'sync:live-odds', 'sync:results', 'sync:settlements'],
  social: ['export:social-card'],
};

@ApiExcludeController()
@SkipThrottle()
@Controller('cron')
export class CronController {
  constructor(private readonly jobs: SyncJobsService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get(':group')
  async run(@Param('group') group: string, @Headers('authorization') auth: string | undefined) {
    if (!this.env.CRON_SECRET) throw new ServiceUnavailableException('CRON_SECRET no configurado');
    if (!auth || !safeEqual(auth, `Bearer ${this.env.CRON_SECRET}`)) throw new ForbiddenException();
    const jobs = CRON_GROUPS[group];
    if (!jobs) throw new NotFoundException(`Grupo desconocido: ${group}`);
    const started = Date.now();
    const results: Array<{ job: JobName; status: string; reason?: string; ms: number }> = [];
    const pending: JobName[] = [];
    for (const job of jobs) {
      if (Date.now() - started > this.env.CRON_TIME_BUDGET_MS) {
        pending.push(job);
        continue;
      }
      const t = Date.now();
      try {
        const r = await this.jobs.execute(job);
        results.push({ job, status: r.status, reason: r.reason, ms: Date.now() - t });
      } catch (e) {
        results.push({ job, status: 'FAILED', reason: (e as Error).message.slice(0, 200), ms: Date.now() - t });
      }
    }
    return { group, durationMs: Date.now() - started, results, pending };
  }
}
