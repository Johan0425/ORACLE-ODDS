import type { AppEnv } from '../../config/env';
import { ProviderHttpClient, ProviderHttpError, type QuotaGate } from '../../common/http/provider-http-client';
import type {
  FixturesProvider,
  InjuriesProvider,
  LineupsProvider,
  LiveScoresProvider,
  StatisticsProvider,
  SportsDataProvider,
} from '../interfaces';
import type { NormalizedFixture, NormalizedOddsEvent } from '../types';
import {
  envelopeSchema,
  mapEvents,
  mapFixtures,
  mapInjuries,
  mapLeagues,
  mapLineups,
  mapOdds,
  mapStandings,
  mapStatistics,
  mapTeams,
} from './api-football.mappers';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Adaptador de API-Football v3 (api-sports.io). Cubre catálogo, partidos
 * históricos/próximos/en vivo, resultados, clasificaciones, estadísticas,
 * eventos, alineaciones, lesiones y — si el plan lo incluye y el flag está
 * activo — cuotas prepartido.
 */
export class ApiFootballAdapter
  implements SportsDataProvider, FixturesProvider, LiveScoresProvider, StatisticsProvider, LineupsProvider, InjuriesProvider
{
  readonly provider = 'API_FOOTBALL' as const;
  private readonly http: ProviderHttpClient | null;

  constructor(private readonly env: AppEnv, quota?: QuotaGate, fetchImpl?: typeof fetch) {
    this.http = env.API_FOOTBALL_KEY
      ? new ProviderHttpClient({
          provider: this.provider,
          baseUrl: env.API_FOOTBALL_BASE_URL,
          headers: { 'x-apisports-key': env.API_FOOTBALL_KEY },
          perMinute: env.API_FOOTBALL_PER_MINUTE,
          remainingHeader: 'x-ratelimit-requests-remaining',
          timeoutMs: 15_000,
          quota,
          fetchImpl,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.http != null;
  }

  private async request(path: string, params: Record<string, string | number | undefined>): Promise<unknown[]> {
    if (!this.http) throw new ProviderHttpError(this.provider, 0, 'API_FOOTBALL_KEY no configurada', false);
    const all: unknown[] = [];
    let page = 1;
    let total = 1;
    do {
      const res = await this.http.get<unknown>(path, page > 1 ? { ...params, page } : params);
      const env = envelopeSchema.safeParse(res.data);
      if (!env.success) throw new ProviderHttpError(this.provider, res.status, `${path}: respuesta con formato inesperado`, false);
      const errors = env.data.errors;
      const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
      if (hasErrors) {
        // API-Football devuelve 200 con `errors` (plan, cupo, parámetros). Se expone el tipo, no el detalle crudo.
        const keys = Array.isArray(errors) ? 'list' : Object.keys(errors as object).join(',');
        throw new ProviderHttpError(this.provider, 200, `${path}: el proveedor reportó errores (${keys})`, false);
      }
      all.push(...env.data.response);
      total = env.data.paging?.total ?? 1;
      page += 1;
    } while (page <= total && page <= 10);
    return all;
  }

  async getLeagues(ids: string[]) {
    const out = [];
    for (const id of ids) out.push(...mapLeagues(await this.request('leagues', { id })));
    return out;
  }

  async getTeams(leagueId: string, season: string) {
    return mapTeams(await this.request('teams', { league: leagueId, season }));
  }

  async getStandings(leagueId: string, season: string) {
    return mapStandings(await this.request('standings', { league: leagueId, season }));
  }

  async getFixtures(params: { leagueId: string; season: string; from: Date; to: Date }): Promise<NormalizedFixture[]> {
    const items = await this.request('fixtures', { league: params.leagueId, season: params.season, from: ymd(params.from), to: ymd(params.to), timezone: 'UTC' });
    return mapFixtures(items).fixtures;
  }

  async getFixturesByIds(ids: string[]): Promise<NormalizedFixture[]> {
    const out: NormalizedFixture[] = [];
    // El endpoint admite hasta 20 IDs separados por guiones.
    for (let i = 0; i < ids.length; i += 20) {
      out.push(...mapFixtures(await this.request('fixtures', { ids: ids.slice(i, i + 20).join('-'), timezone: 'UTC' })).fixtures);
    }
    return out;
  }

  async getLiveFixtures(leagueIds?: string[]): Promise<NormalizedFixture[]> {
    const live = leagueIds && leagueIds.length > 0 ? leagueIds.join('-') : 'all';
    return mapFixtures(await this.request('fixtures', { live, timezone: 'UTC' })).fixtures;
  }

  async getFixtureStatistics(fixtureId: string) {
    return mapStatistics(fixtureId, await this.request('fixtures/statistics', { fixture: fixtureId }));
  }

  async getFixtureEvents(fixtureId: string) {
    return mapEvents(fixtureId, await this.request('fixtures/events', { fixture: fixtureId }));
  }

  async getLineups(fixtureId: string) {
    return mapLineups(fixtureId, await this.request('fixtures/lineups', { fixture: fixtureId }));
  }

  async getInjuries(fixtureId: string) {
    return mapInjuries(await this.request('injuries', { fixture: fixtureId }));
  }

  /** Cuotas prepartido por partido; requiere plan con odds y ENABLE_API_FOOTBALL_ODDS=true. */
  async getFixtureOdds(fixtureId: string): Promise<NormalizedOddsEvent[]> {
    if (!this.env.ENABLE_API_FOOTBALL_ODDS) return [];
    return mapOdds(await this.request('odds', { fixture: fixtureId }));
  }

  /** Temporada vigente según el proveedor para una liga. */
  async currentSeason(leagueId: string): Promise<string | null> {
    if (this.env.API_FOOTBALL_SEASON) return this.env.API_FOOTBALL_SEASON;
    const [league] = await this.getLeagues([leagueId]);
    return league?.season?.label ?? null;
  }
}
