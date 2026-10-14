import type { DataProvider } from '@prisma/client';
import type {
  NormalizedEvent,
  NormalizedFixture,
  NormalizedInjury,
  NormalizedLeague,
  NormalizedLineup,
  NormalizedOddsEvent,
  NormalizedScoreUpdate,
  NormalizedStanding,
  NormalizedTeam,
  NormalizedTeamStats,
} from './types';

/**
 * Puertos de datos. Cada adaptador implementa solo los que su proveedor cubre;
 * el registro de proveedores decide cuál usar para cada capacidad. Así se puede
 * sustituir un proveedor sin tocar normalización, workers ni frontend.
 */

export interface ProviderInfo {
  readonly provider: DataProvider;
  /** true si tiene credenciales/flags para operar. */
  isConfigured(): boolean;
}

export interface SportsDataProvider extends ProviderInfo {
  getLeagues(ids: string[]): Promise<NormalizedLeague[]>;
  getTeams(leagueId: string, season: string): Promise<NormalizedTeam[]>;
  getStandings(leagueId: string, season: string): Promise<NormalizedStanding[]>;
}

export interface FixturesProvider extends ProviderInfo {
  getFixtures(params: { leagueId: string; season: string; from: Date; to: Date }): Promise<NormalizedFixture[]>;
  getFixturesByIds(ids: string[]): Promise<NormalizedFixture[]>;
}

export interface LiveScoresProvider extends ProviderInfo {
  getLiveFixtures(leagueIds?: string[]): Promise<NormalizedFixture[]>;
}

export interface StatisticsProvider extends ProviderInfo {
  getFixtureStatistics(fixtureId: string): Promise<NormalizedTeamStats[]>;
  getFixtureEvents(fixtureId: string): Promise<NormalizedEvent[]>;
}

export interface LineupsProvider extends ProviderInfo {
  getLineups(fixtureId: string): Promise<NormalizedLineup[]>;
}

export interface InjuriesProvider extends ProviderInfo {
  getInjuries(fixtureId: string): Promise<NormalizedInjury[]>;
}

export interface OddsProvider extends ProviderInfo {
  getPrematchOdds(competitionKey: string): Promise<NormalizedOddsEvent[]>;
  getLiveOdds(competitionKey: string): Promise<NormalizedOddsEvent[]>;
}

export interface HistoricalOddsProvider extends ProviderInfo {
  getHistoricalOdds(competitionKey: string, at: Date): Promise<NormalizedOddsEvent[]>;
}

export interface ResultsProvider extends ProviderInfo {
  getResults(competitionKey: string, daysFrom: number): Promise<NormalizedScoreUpdate[]>;
}

export interface MetadataProvider extends ProviderInfo {
  findTeamBadge(teamName: string): Promise<{ logoUrl: string | null; venueName: string | null } | null>;
}
