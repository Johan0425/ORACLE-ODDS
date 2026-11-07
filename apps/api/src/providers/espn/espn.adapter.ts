import type { AppEnv } from '../../config/env';
import { ProviderHttpClient, ProviderHttpError } from '../../common/http/provider-http-client';
import type { ProviderInfo } from '../interfaces';
import type { NormalizedStanding } from '../types';
import { DEFAULT_ESPN_LEAGUES, mapScoreboard, mapStandings, type EspnMapped } from './espn.mappers';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Adaptador de los endpoints públicos de ESPN (sin clave ni cupo publicado).
 * Cubre calendario completo por año o mes, resultados, marcador en vivo,
 * clasificación y cuotas de una casa de referencia. Se consulta con cortesía:
 * pocas peticiones agregadas (un año o un mes por liga) en vez de una por partido.
 */
export class EspnAdapter implements ProviderInfo {
  readonly provider = 'ESPN' as const;
  private readonly http: ProviderHttpClient | null;
  readonly leagues: string[];

  constructor(env: AppEnv, fetchImpl?: typeof fetch) {
    this.leagues = env.ESPN_LEAGUES.length ? env.ESPN_LEAGUES : DEFAULT_ESPN_LEAGUES;
    this.http = env.ENABLE_ESPN
      ? new ProviderHttpClient({ provider: this.provider, baseUrl: env.ESPN_BASE_URL, perMinute: 60, timeoutMs: 20_000, maxRetries: 2, fetchImpl })
      : null;
  }

  isConfigured(): boolean {
    return this.http != null;
  }

  private client(): ProviderHttpClient {
    if (!this.http) throw new ProviderHttpError(this.provider, 0, 'ESPN desactivado (ENABLE_ESPN=false)', false);
    return this.http;
  }

  /** `dates` admite YYYY, YYYYMM o YYYYMMDD. ESPN no acepta rangos de días en fútbol. */
  async scoreboard(slug: string, dates: string): Promise<EspnMapped> {
    const res = await this.client().get<unknown>(`site/v2/sports/soccer/${encodeURIComponent(slug)}/scoreboard`, { dates, limit: 1000 });
    return mapScoreboard(slug, res.data);
  }

  season(slug: string, year: number): Promise<EspnMapped> {
    return this.scoreboard(slug, String(year));
  }

  month(slug: string, at: Date): Promise<EspnMapped> {
    return this.scoreboard(slug, `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}`);
  }

  day(slug: string, at: Date): Promise<EspnMapped> {
    return this.scoreboard(slug, `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`);
  }

  async standings(slug: string): Promise<NormalizedStanding[]> {
    const res = await this.client().get<unknown>(`v2/sports/soccer/${encodeURIComponent(slug)}/standings`);
    return mapStandings(slug, res.data);
  }
}
