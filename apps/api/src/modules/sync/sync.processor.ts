import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { FOOTBALL_PROVIDER, type FootballProvider } from '../../providers/football/football-provider.interface';
import { withQuota } from '../../common/quota-guard';
import { PrismaQuotaStore } from './quota.store';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Job `sync:fixtures:daily` del plan del punto 6 — 1 request por liga, guardado por cupo. */
@Processor('sync-fixtures')
export class SyncFixturesProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncFixturesProcessor.name);

  constructor(
    @Inject(FOOTBALL_PROVIDER) private readonly footballProvider: FootballProvider,
    private readonly quotaStore: PrismaQuotaStore,
  ) {
    super();
  }

  async process(job: Job<{ leagueExternalId: string }>): Promise<number> {
    const { leagueExternalId } = job.data;

    try {
      const fixtures = await withQuota(this.quotaStore, 'API_FOOTBALL', 1, () =>
        this.footballProvider.getFixtures(leagueExternalId, new Date(), addDays(new Date(), 7)),
      );
      this.logger.log(`Liga ${leagueExternalId}: ${fixtures.length} fixtures sincronizados`);
      return fixtures.length;
    } catch (error) {
      this.logger.warn(`Sin cupo o error sincronizando ${leagueExternalId}: ${(error as Error).message}`);
      return 0;
    }
  }
}
