import { z } from 'zod';
import type { AppEnv } from '../../config/env';
import { ProviderHttpClient, ProviderHttpError, type QuotaGate } from '../../common/http/provider-http-client';
import type { HistoricalOddsProvider, OddsProvider, ResultsProvider } from '../interfaces';
import type { NormalizedOddsEvent, NormalizedScoreUpdate } from '../types';
import { mapOddsEvents, mapScores } from './odds-api.mappers';

/**
 * The Odds API v4 (the-odds-api.com). Cuotas de múltiples casas por región,
 * mercados h2h/spreads/totals, resultados y — en planes que lo incluyen —
 * histórico. Una llamada a /odds devuelve prepartido y en vivo; el coste en
 * cupo es (mercados × regiones).
 */
export class OddsApiAdapter implements OddsProvider, HistoricalOddsProvider, ResultsProvider {
  readonly provider = 'THE_ODDS_API' as const;
  private readonly http: ProviderHttpClient | null;

  constructor(private readonly env: AppEnv, quota?: QuotaGate, fetchImpl?: typeof fetch) {
    this.http = env.THE_ODDS_API_KEY
      ? new ProviderHttpClient({
          provider: this.provider,
          baseUrl: `${env.THE_ODDS_API_BASE_URL}/v4/`,
          query: { apiKey: env.THE_ODDS_API_KEY },
          remainingHeader: 'x-requests-remaining',
          perMinute: 30,
          timeoutMs: 15_000,
          quota,
          fetchImpl,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.http != null;
  }

  private client(): ProviderHttpClient {
    if (!this.http) throw new ProviderHttpError(this.provider, 0, 'THE_ODDS_API_KEY no configurada', false);
    return this.http;
  }

  private get oddsCost(): number {
    return this.env.ODDS_MARKETS.split(',').filter(Boolean).length * this.env.ODDS_REGIONS.split(',').filter(Boolean).length;
  }

  private oddsParams(): Record<string, string> {
    const params: Record<string, string> = {
      regions: this.env.ODDS_REGIONS,
      markets: this.env.ODDS_MARKETS,
      oddsFormat: 'decimal',
      dateFormat: 'iso',
      includeLinks: 'true',
    };
    if (this.env.ALLOWED_BOOKMAKERS.length > 0) {
      // Con `bookmakers` el proveedor ignora `regions`; se mantiene la lista autorizada como filtro de origen.
      params.bookmakers = this.env.ALLOWED_BOOKMAKERS.join(',');
      delete params.regions;
    }
    return params;
  }

  /** Catálogo de deportes/competiciones activos (no consume cupo). */
  async listSports(): Promise<Array<{ key: string; group: string; title: string; active: boolean; has_outrights: boolean }>> {
    const res = await this.client().get<unknown>('sports', {}, 0);
    const parsed = z.array(z.object({ key: z.string(), group: z.string(), title: z.string(), active: z.boolean(), has_outrights: z.boolean() })).safeParse(res.data);
    return parsed.success ? parsed.data : [];
  }

  /** Todas las cuotas (prepartido + en vivo) de una competición en una sola llamada. */
  async getOdds(sportKey: string): Promise<NormalizedOddsEvent[]> {
    const res = await this.client().get<unknown[]>(`sports/${encodeURIComponent(sportKey)}/odds`, this.oddsParams(), this.oddsCost);
    if (!Array.isArray(res.data)) throw new ProviderHttpError(this.provider, res.status, 'odds: respuesta con formato inesperado', false);
    return mapOddsEvents(res.data).events;
  }

  async getPrematchOdds(sportKey: string): Promise<NormalizedOddsEvent[]> {
    return (await this.getOdds(sportKey)).filter((e) => e.prices.every((p) => !p.isLive));
  }

  async getLiveOdds(sportKey: string): Promise<NormalizedOddsEvent[]> {
    return (await this.getOdds(sportKey)).filter((e) => e.prices.some((p) => p.isLive));
  }

  async getHistoricalOdds(sportKey: string, at: Date): Promise<NormalizedOddsEvent[]> {
    if (!this.env.ENABLE_HISTORICAL_ODDS) return [];
    const res = await this.client().get<{ data?: unknown[] }>(
      `historical/sports/${encodeURIComponent(sportKey)}/odds`,
      { ...this.oddsParams(), date: at.toISOString().replace(/\.\d{3}Z$/, 'Z') },
      this.oddsCost * 10,
    );
    // Las cuotas históricas no son "en vivo" aunque el evento ya haya empezado respecto a hoy.
    return mapOddsEvents(res.data?.data ?? [], at).events;
  }

  async getResults(sportKey: string, daysFrom = 1): Promise<NormalizedScoreUpdate[]> {
    const res = await this.client().get<unknown[]>(`sports/${encodeURIComponent(sportKey)}/scores`, { daysFrom, dateFormat: 'iso' }, daysFrom > 0 ? 2 : 1);
    return Array.isArray(res.data) ? mapScores(res.data) : [];
  }
}
