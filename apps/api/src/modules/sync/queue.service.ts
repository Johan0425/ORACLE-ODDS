import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { redisOptions } from '../../common/redis';
import { SyncJobsService, type JobName } from './sync-jobs.service';

type QueueKey = 'sync' | 'live' | 'compute';

export const QUEUE_NAMES: Record<QueueKey | 'dlq', string> = {
  sync: 'oracle-sync',
  live: 'oracle-live',
  compute: 'oracle-compute',
  dlq: 'oracle-dead-letter',
};

const JOB_QUEUE: Record<JobName, QueueKey> = {
  'sync:sports-catalog': 'sync',
  'sync:leagues': 'sync',
  'sync:teams': 'sync',
  'sync:historical-fixtures': 'sync',
  'sync:upcoming-fixtures': 'sync',
  'sync:live-fixtures': 'live',
  'sync:fixture-details': 'sync',
  'sync:lineups': 'sync',
  'sync:injuries': 'sync',
  'sync:prematch-odds': 'sync',
  'sync:live-odds': 'live',
  'sync:results': 'live',
  'sync:settlements': 'compute',
  'compute:predictions': 'compute',
  'compute:value-bets': 'compute',
  'compute:model-metrics': 'compute',
  'export:social-card': 'compute',
};

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** Productor de jobs: lo usa la API (POST /admin/sync) y el propio worker para programar. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  get available(): boolean {
    return redisOptions(this.env) != null;
  }

  queue(key: QueueKey | 'dlq'): Queue {
    const name = QUEUE_NAMES[key];
    let q = this.queues.get(name);
    if (!q) {
      const connection = redisOptions(this.env);
      if (!connection) throw new Error('Redis no configurado');
      q = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
      this.queues.set(name, q);
    }
    return q;
  }

  async enqueue(name: JobName, correlationId = randomUUID()): Promise<string> {
    // jobId determinista por minuto: dos peticiones simultáneas no encolan el mismo job dos veces.
    const minute = new Date().toISOString().slice(0, 16);
    const job = await this.queue(JOB_QUEUE[name]).add(name, { correlationId, manual: true }, { jobId: `${name}:manual:${minute}` });
    return job.id ?? correlationId;
  }

  /** Programa los jobs repetibles con frecuencias configurables por entorno. */
  async registerSchedules(): Promise<void> {
    const e = this.env;
    const every: Array<[JobName, number]> = [
      ['sync:sports-catalog', e.SYNC_CATALOG_EVERY_MS],
      ['sync:leagues', e.SYNC_CATALOG_EVERY_MS],
      ['sync:teams', e.SYNC_CATALOG_EVERY_MS],
      ['sync:upcoming-fixtures', e.SYNC_UPCOMING_EVERY_MS],
      ['sync:live-fixtures', e.SYNC_LIVE_EVERY_MS],
      ['sync:fixture-details', e.SYNC_DETAILS_EVERY_MS],
      ['sync:lineups', 10 * 60_000],
      ['sync:injuries', 6 * 60 * 60_000],
      ['sync:prematch-odds', e.SYNC_PREMATCH_ODDS_EVERY_MS],
      ['sync:live-odds', e.SYNC_LIVE_ODDS_EVERY_MS],
      ['sync:results', e.SYNC_RESULTS_EVERY_MS],
      ['sync:settlements', e.SYNC_RESULTS_EVERY_MS],
      ['compute:predictions', e.COMPUTE_PREDICTIONS_EVERY_MS],
      ['compute:value-bets', e.COMPUTE_VALUE_BETS_EVERY_MS],
    ];
    const cron: Array<[JobName, string]> = [
      ['sync:historical-fixtures', e.SYNC_HISTORICAL_CRON],
      ['compute:model-metrics', e.COMPUTE_METRICS_CRON],
      ['export:social-card', '0 13 * * *'],
    ];
    for (const [name, ms] of every) {
      await this.queue(JOB_QUEUE[name]).upsertJobScheduler(name, { every: ms }, { name, data: {}, opts: DEFAULT_JOB_OPTIONS });
    }
    for (const [name, pattern] of cron) {
      await this.queue(JOB_QUEUE[name]).upsertJobScheduler(name, { pattern, tz: 'UTC' }, { name, data: {}, opts: DEFAULT_JOB_OPTIONS });
    }
    this.logger.log(`Programados ${every.length + cron.length} jobs repetibles`);
  }

  async counts() {
    if (!this.available) return null;
    const out: Record<string, Record<string, number>> = {};
    for (const key of ['sync', 'live', 'compute', 'dlq'] as const) {
      out[QUEUE_NAMES[key]] = await this.queue(key).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    }
    return out;
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}

/** Consumidor: solo corre en el proceso worker (PROCESS_ROLE=worker). */
@Injectable()
export class WorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workers: Worker[] = [];

  constructor(@Inject(APP_ENV) private readonly env: AppEnv, private readonly jobs: SyncJobsService, private readonly queues: QueueService) {}

  async start(): Promise<void> {
    const connection = redisOptions(this.env);
    if (!connection) throw new Error('El worker requiere Redis (REDIS_URL o REDIS_HOST)');
    const concurrency: Record<QueueKey, number> = { sync: 1, live: 2, compute: 1 };
    for (const key of ['sync', 'live', 'compute'] as const) {
      const worker = new Worker(
        QUEUE_NAMES[key],
        async (job: Job<{ correlationId?: string }>) => this.jobs.execute(job.name as JobName, job.data?.correlationId ?? job.id),
        { connection, concurrency: concurrency[key], lockDuration: 10 * 60_000 },
      );
      worker.on('failed', async (job, err) => {
        if (!job) return;
        const attempts = job.opts.attempts ?? 1;
        if (job.attemptsMade >= attempts) {
          // Dead-letter: se conserva el job y el error para inspección y re-ejecución manual.
          await this.queues.queue('dlq').add(
            `dead:${job.name}`,
            { originalQueue: QUEUE_NAMES[key], name: job.name, data: job.data, error: err.message.slice(0, 500), failedAt: new Date().toISOString(), attempts: job.attemptsMade },
            { removeOnComplete: false, removeOnFail: false },
          );
          this.logger.error(`Job ${job.name} agotó ${attempts} intentos y pasó a la dead-letter queue`);
        }
      });
      this.workers.push(worker);
    }
    await this.queues.registerSchedules();
    this.logger.log('Worker iniciado');
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close().catch(() => undefined)));
  }
}
