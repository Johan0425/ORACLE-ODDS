import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env';
import { QuotaService } from './quota.service';
import { ApiFootballAdapter } from './api-football/api-football.adapter';
import { OddsApiAdapter } from './the-odds-api/odds-api.adapter';
import { OddsApiIoAdapter } from './odds-api-io/odds-api-io.adapter';
import { TheSportsDbAdapter } from './thesportsdb/thesportsdb.adapter';

/** Instancias de adaptadores por proveedor; cada job pregunta `isConfigured()` antes de usarlos. */
@Injectable()
export class ProviderRegistry {
  readonly apiFootball: ApiFootballAdapter;
  readonly oddsApi: OddsApiAdapter;
  readonly oddsApiIo: OddsApiIoAdapter;
  readonly theSportsDb: TheSportsDbAdapter;

  constructor(@Inject(APP_ENV) env: AppEnv, quota: QuotaService) {
    this.apiFootball = new ApiFootballAdapter(env, quota);
    this.oddsApi = new OddsApiAdapter(env, quota);
    this.oddsApiIo = new OddsApiIoAdapter(env, quota);
    this.theSportsDb = new TheSportsDbAdapter(env);
  }

  status() {
    return {
      API_FOOTBALL: { configured: this.apiFootball.isConfigured(), roles: ['fixtures', 'live', 'results', 'statistics', 'events', 'lineups', 'injuries', 'standings'] },
      THE_ODDS_API: { configured: this.oddsApi.isConfigured(), roles: ['prematch-odds', 'live-odds', 'results'] },
      ODDS_API_IO: { configured: this.oddsApiIo.isConfigured(), roles: ['odds (opcional)'] },
      THESPORTSDB: { configured: this.theSportsDb.isConfigured(), roles: ['metadatos e imágenes'] },
    };
  }
}

@Global()
@Module({
  providers: [QuotaService, ProviderRegistry],
  exports: [QuotaService, ProviderRegistry],
})
export class ProvidersModule {}
