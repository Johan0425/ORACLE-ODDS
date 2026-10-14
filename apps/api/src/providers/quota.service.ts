import { Inject, Injectable } from '@nestjs/common';
import type { DataProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env';
import { QuotaExceededError, type QuotaGate } from '../common/http/provider-http-client';

/**
 * Presupuesto diario por proveedor en Postgres (compartido por todas las
 * réplicas). Además respeta el restante que informa el propio proveedor.
 */
@Injectable()
export class QuotaService implements QuotaGate {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  dailyLimit(provider: DataProvider): number {
    switch (provider) {
      case 'API_FOOTBALL':
        return this.env.API_FOOTBALL_DAILY_LIMIT;
      case 'THE_ODDS_API':
        return Math.max(1, Math.floor(this.env.THE_ODDS_API_MONTHLY_LIMIT / 30));
      case 'THESPORTSDB':
        return 1000;
      default:
        return 500;
    }
  }

  private today(): Date {
    return new Date(new Date().toISOString().slice(0, 10));
  }

  async usage(provider: DataProvider) {
    const row = await this.prisma.providerQuotaUsage.findUnique({ where: { provider_date: { provider, date: this.today() } } });
    return { used: row?.requestsUsed ?? 0, limit: row?.requestLimit ?? this.dailyLimit(provider), reportedRemaining: row?.reportedRemaining ?? null };
  }

  async reserve(provider: string, cost: number): Promise<void> {
    if (cost <= 0) return;
    const u = await this.usage(provider as DataProvider);
    if (u.used + cost > u.limit) throw new QuotaExceededError(provider, `${u.used}/${u.limit} hoy`);
    if (u.reportedRemaining != null && u.reportedRemaining < cost) throw new QuotaExceededError(provider, `restante informado ${u.reportedRemaining}`);
  }

  async record(provider: string, cost: number, reportedRemaining: number | null): Promise<void> {
    const p = provider as DataProvider;
    await this.prisma.providerQuotaUsage.upsert({
      where: { provider_date: { provider: p, date: this.today() } },
      create: { provider: p, date: this.today(), requestsUsed: cost, requestLimit: this.dailyLimit(p), reportedRemaining },
      update: { requestsUsed: { increment: cost }, ...(reportedRemaining != null ? { reportedRemaining } : {}) },
    });
  }
}
