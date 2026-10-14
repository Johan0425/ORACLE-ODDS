import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { ProviderRegistry } from '../../providers/providers.module';
import { QuotaService } from '../../providers/quota.service';
import { SponsorService } from '../affiliate/sponsor.service';

/** Umbral (segundos) tras el cual cada job se considera vencido en el panel público. */
const STALE_AFTER: Record<string, number> = {
  'sync:upcoming-fixtures': 3 * 3600,
  'sync:prematch-odds': 3600,
  'sync:live-fixtures': 300,
  'sync:live-odds': 600,
  'sync:results': 1800,
  'sync:historical-fixtures': 2 * 86_400,
  'sync:teams': 3 * 86_400,
  'sync:leagues': 3 * 86_400,
};

/**
 * Estado público y honesto de los datos: qué proveedores están configurados,
 * cuándo fue la última sincronización exitosa de cada job y si hay datos
 * reales disponibles. Nunca expone claves ni mensajes crudos del proveedor.
 */
@Injectable()
export class DataStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly quota: QuotaService,
    private readonly sponsor: SponsorService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async status() {
    const now = Date.now();
    const [states, upcoming, live, quotes, activeValueBets, lastOdds] = await Promise.all([
      this.prisma.providerSyncState.findMany({ orderBy: [{ provider: 'asc' }, { jobName: 'asc' }] }),
      this.prisma.fixture.count({ where: { primaryProvider: { not: null }, status: 'SCHEDULED', kickoff: { gt: new Date() } } }),
      this.prisma.fixture.count({ where: { primaryProvider: { not: null }, status: 'LIVE' } }),
      this.prisma.oddsQuote.count({ where: { bookmaker: { isAuthorized: true } } }),
      this.prisma.valueBet.count({ where: { status: 'ACTIVE' } }),
      this.prisma.oddsQuote.aggregate({ _max: { lastSeenAt: true } }),
    ]);
    const registry = this.providers.status();
    const providers = await Promise.all(
      Object.entries(registry).map(async ([provider, info]) => {
        const usage = info.configured ? await this.quota.usage(provider as never) : null;
        return { provider, ...info, quota: usage ? { usedToday: usage.used, dailyLimit: usage.limit, reportedRemaining: usage.reportedRemaining } : null };
      }),
    );
    const jobs = states.map((s) => {
      const age = s.lastSuccessfulSync ? Math.round((now - s.lastSuccessfulSync.getTime()) / 1000) : null;
      const limit = STALE_AFTER[s.jobName];
      return {
        provider: s.provider,
        job: s.jobName,
        lastSuccessfulSync: s.lastSuccessfulSync,
        lastRunAt: s.lastRunAt,
        ageSeconds: age,
        stale: age == null || (limit != null && age > limit),
        consecutiveFailures: s.consecutiveFailures,
        lastError: s.lastError ? s.lastError.replace(/[A-Za-z0-9_-]{24,}/g, '***').slice(0, 160) : null,
      };
    });
    const anyConfigured = providers.some((p) => p.configured && p.provider !== 'THESPORTSDB');
    const hasData = upcoming + live > 0;
    return {
      generatedAt: new Date(),
      timezone: this.env.DEFAULT_TIMEZONE,
      overall: !anyConfigured ? 'NOT_CONFIGURED' : !hasData ? 'NO_DATA_YET' : jobs.some((j) => j.stale) ? 'DEGRADED' : 'OK',
      message: !anyConfigured
        ? 'No hay proveedores de datos configurados. La plataforma no muestra partidos ni cuotas hasta conectar una fuente real.'
        : !hasData
          ? 'Proveedores configurados; esperando la primera sincronización.'
          : 'Datos reales sincronizados.',
      providers,
      jobs,
      counts: { upcomingFixtures: upcoming, liveFixtures: live, authorizedQuotes: quotes, activeValueBets },
      lastOddsUpdate: lastOdds._max.lastSeenAt,
      authorizedBookmakersConfigured: this.env.ALLOWED_BOOKMAKERS.length,
      sponsor: this.sponsor.status(),
      worker: { enabledInThisProcess: this.env.ENABLE_SYNC_WORKER, redisConfigured: !!(this.env.REDIS_URL || this.env.REDIS_HOST) },
    };
  }
}
