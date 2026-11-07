import { Controller, ForbiddenException, Get, Headers, HttpCode, Inject, Logger, NotFoundException, Param, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { waitUntil } from '@vercel/functions';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { safeEqual } from '../../common/hashing';
import { SyncJobsService, type JobName } from '../sync/sync-jobs.service';
import { DemoService } from '../demo/demo.service';

/**
 * Grupos de jobs para entornos sin worker persistente (Vercel Functions). Cada
 * invocación ejecuta los jobs del grupo en orden hasta agotar el presupuesto
 * de tiempo; los que no alcancen corren en la siguiente invocación. No usa
 * BullMQ: los jobs son idempotentes y llevan lock y registro igual que en el worker.
 */
export const CRON_GROUPS: Record<string, JobName[]> = {
  daily: [
    'sync:sports-catalog',
    'sync:espn-history',
    'sync:espn-fixtures',
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
    'compute:ai-analysis',
  ],
  // Cada 30 min: calendario/cuotas de la ventana y predicciones. El histórico es un no-op cuando ya está cargado.
  odds: ['sync:espn-history', 'sync:espn-fixtures', 'sync:upcoming-fixtures', 'sync:lineups', 'sync:prematch-odds', 'compute:predictions', 'compute:value-bets'],
  live: ['sync:espn-live', 'sync:live-fixtures', 'sync:live-odds', 'sync:results', 'sync:settlements'],
  // Cada hora/día: backtest incremental y calibración (habilitan la publicación de mercados) y análisis IA.
  model: ['compute:model-metrics', 'compute:ai-analysis'],
  social: ['export:social-card'],
};

@ApiExcludeController()
@SkipThrottle()
@Controller('cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly jobs: SyncJobsService, private readonly demo: DemoService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /**
   * `?async=1`: responde 202 al instante y ejecuta el grupo en segundo plano
   * (waitUntil). Para disparadores externos con timeout corto (cron-job.org: 30 s).
   */
  @Get(':group')
  @HttpCode(200)
  async run(
    @Param('group') group: string,
    @Headers('authorization') auth: string | undefined,
    @Query('async') async: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.env.CRON_SECRET) throw new ServiceUnavailableException('CRON_SECRET no configurado');
    if (!auth || !safeEqual(auth, `Bearer ${this.env.CRON_SECRET}`)) throw new ForbiddenException();
    const jobs = CRON_GROUPS[group];
    if (!jobs) throw new NotFoundException(`Grupo desconocido: ${group}`);
    if (async === '1' || async === 'true') {
      waitUntil(
        this.runGroup(group, jobs).then(
          (r) => this.logger.log(`Cron ${group} terminado en ${r.durationMs} ms`),
          (e: Error) => this.logger.error(`Cron ${group} falló: ${e.message}`),
        ),
      );
      res.status(202);
      return { group, accepted: true };
    }
    return this.runGroup(group, jobs);
  }

  private async runGroup(group: string, jobs: JobName[]) {
    const started = Date.now();
    const results: Array<{ job: JobName | 'demo:advance' | 'demo:purge'; status: string; reason?: string; ms: number }> = [];
    const pending: JobName[] = [];
    if (!this.env.DEMO_MODE) {
      const t = Date.now();
      const purged = await this.demo.purgeLeftovers().catch((e: Error) => {
        results.push({ job: 'demo:purge', status: 'FAILED', reason: e.message.slice(0, 200), ms: Date.now() - t });
        return 0;
      });
      if (purged > 0) results.push({ job: 'demo:purge', status: 'SUCCEEDED', reason: `${purged} partidos ficticios eliminados`, ms: Date.now() - t });
    }
    if (this.env.DEMO_MODE && (group === 'daily' || group === 'odds')) {
      // Demo: avanza partidos ficticios y refresca sus cuotas antes de recalcular.
      const t = Date.now();
      try {
        const r = await this.demo.run('advance', 90_000);
        results.push({ job: 'demo:advance', status: 'SUCCEEDED', reason: JSON.stringify(r.details).slice(0, 200), ms: Date.now() - t });
      } catch (e) {
        results.push({ job: 'demo:advance', status: 'FAILED', reason: (e as Error).message.slice(0, 200), ms: Date.now() - t });
      }
    }
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
