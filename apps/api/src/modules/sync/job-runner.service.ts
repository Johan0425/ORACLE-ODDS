import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { DataProvider } from '@prisma/client';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { DistributedLock } from '../../common/distributed-lock';
import { createRedis } from '../../common/redis';
import { appLogger, redact } from '../../common/logger';
import { correlationId, runWithContext } from '../../common/request-context';
import { dataFreshnessSeconds, jobDuration, jobRuns } from '../../common/metrics';

export interface JobOutcome {
  status: 'SUCCEEDED' | 'SKIPPED';
  reason?: string;
  fetched?: number;
  created?: number;
  updated?: number;
  duplicates?: number;
  details?: Record<string, unknown>;
}

export class SkipJob extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SkipJob';
  }
}

/**
 * Envuelve cada job: correlation ID, lock distribuido (no dos ejecuciones
 * simultáneas del mismo job), registro en SyncRunLog, estado por proveedor con
 * lastSuccessfulSync, métricas y logs estructurados.
 */
@Injectable()
export class JobRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(JobRunnerService.name);
  readonly redis: Redis | null;
  private readonly lock: DistributedLock;

  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) env: AppEnv) {
    this.redis = env.NODE_ENV === 'test' ? null : createRedis(env, 'locks');
    this.lock = new DistributedLock(this.redis);
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  async run(jobName: string, provider: DataProvider | null, fn: () => Promise<JobOutcome>, options: { lockTtlMs?: number; correlationId?: string } = {}): Promise<JobOutcome> {
    return runWithContext({ correlationId: options.correlationId, jobName, provider: provider ?? undefined }, async () => {
      const started = Date.now();
      const { acquired, result } = await this.lock.withLock(`job:${jobName}`, options.lockTtlMs ?? 10 * 60_000, async () => {
        const log = await this.prisma.syncRunLog.create({
          data: { jobName, provider, correlationId: correlationId() ?? 'n/a', status: 'RUNNING' },
        });
        try {
          const outcome = await fn();
          await this.finish(log.id, jobName, provider, started, outcome);
          return outcome;
        } catch (error) {
          if (error instanceof SkipJob) {
            const outcome: JobOutcome = { status: 'SKIPPED', reason: error.message };
            await this.finish(log.id, jobName, provider, started, outcome);
            return outcome;
          }
          await this.fail(log.id, jobName, provider, started, error as Error);
          throw error;
        }
      });
      if (!acquired) {
        jobRuns.inc({ job: jobName, status: 'locked' });
        appLogger.event('info', 'Job omitido: otra instancia lo está ejecutando', { job: jobName });
        return { status: 'SKIPPED', reason: 'LOCKED' } as JobOutcome;
      }
      return result as JobOutcome;
    });
  }

  private async finish(logId: string, jobName: string, provider: DataProvider | null, started: number, o: JobOutcome) {
    const durationMs = Date.now() - started;
    await this.prisma.syncRunLog.update({
      where: { id: logId },
      data: {
        status: o.status,
        finishedAt: new Date(),
        itemsFetched: o.fetched ?? 0,
        itemsCreated: o.created ?? 0,
        itemsUpdated: o.updated ?? 0,
        duplicatesSkipped: o.duplicates ?? 0,
        errorMessage: o.reason ?? null,
      },
    });
    if (provider) {
      const succeeded = o.status === 'SUCCEEDED';
      await this.prisma.providerSyncState.upsert({
        where: { provider_jobName: { provider, jobName } },
        create: {
          provider,
          jobName,
          lastRunAt: new Date(),
          lastSuccessfulSync: succeeded ? new Date() : null,
          lastDurationMs: durationMs,
          itemsProcessed: o.fetched ?? 0,
          lastError: succeeded ? null : o.reason,
        },
        update: {
          lastRunAt: new Date(),
          ...(succeeded ? { lastSuccessfulSync: new Date(), consecutiveFailures: 0, lastError: null } : { lastError: o.reason }),
          lastDurationMs: durationMs,
          itemsProcessed: o.fetched ?? 0,
        },
      });
      if (succeeded) dataFreshnessSeconds.set({ provider, job: jobName }, 0);
    }
    jobRuns.inc({ job: jobName, status: o.status.toLowerCase() });
    jobDuration.observe({ job: jobName }, durationMs / 1000);
    appLogger.event('info', 'Job terminado', { job: jobName, status: o.status, durationMs, fetched: o.fetched, created: o.created, updated: o.updated, reason: o.reason });
  }

  private async fail(logId: string, jobName: string, provider: DataProvider | null, started: number, error: Error) {
    const message = redact(error.message).slice(0, 500);
    await this.prisma.syncRunLog.update({ where: { id: logId }, data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message } });
    if (provider) {
      await this.prisma.providerSyncState.upsert({
        where: { provider_jobName: { provider, jobName } },
        create: { provider, jobName, lastRunAt: new Date(), lastError: message, lastErrorAt: new Date(), consecutiveFailures: 1 },
        update: { lastRunAt: new Date(), lastError: message, lastErrorAt: new Date(), consecutiveFailures: { increment: 1 } },
      });
    }
    jobRuns.inc({ job: jobName, status: 'failed' });
    jobDuration.observe({ job: jobName }, (Date.now() - started) / 1000);
    this.logger.error(`Job ${jobName} falló: ${message}`);
  }
}
