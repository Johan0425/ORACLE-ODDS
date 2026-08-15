import { Injectable } from '@nestjs/common';
import { DataProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DataProviderKey, QuotaStore, QuotaUsage } from '../../common/quota-guard';

/** Presupuestos diarios del punto 6 — usados solo la primera vez que se ve un proveedor en el día. */
const DEFAULT_LIMITS: Record<DataProviderKey, number> = {
  API_FOOTBALL: 100,
  THE_ODDS_API: 16,
  THESPORTSDB: 200,
  SPORTS_GAME_ODDS: 83,
};

@Injectable()
export class PrismaQuotaStore implements QuotaStore {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(provider: DataProviderKey, date: string): Promise<QuotaUsage> {
    const row = await this.prisma.providerQuotaUsage.findUnique({
      where: { provider_date: { provider: provider as DataProvider, date: new Date(date) } },
    });

    return { used: row?.requestsUsed ?? 0, limit: row?.requestLimit ?? DEFAULT_LIMITS[provider] };
  }

  async increment(provider: DataProviderKey, date: string, cost: number): Promise<void> {
    await this.prisma.providerQuotaUsage.upsert({
      where: { provider_date: { provider: provider as DataProvider, date: new Date(date) } },
      create: {
        provider: provider as DataProvider,
        date: new Date(date),
        requestsUsed: cost,
        requestLimit: DEFAULT_LIMITS[provider],
      },
      update: { requestsUsed: { increment: cost } },
    });
  }
}
