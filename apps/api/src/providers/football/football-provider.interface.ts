export interface ProviderFixture {
  externalId: string;
  leagueExternalId: string;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: Date;
  venue?: string;
  round?: string;
}

export interface ProviderTeamStats {
  teamExternalId: string;
  recentMatches: Array<{ goalsFor: number; goalsAgainst: number; playedAt: Date }>;
}

export interface ProviderH2H {
  matches: Array<{ totalGoals: number; playedAt: Date }>;
}

/**
 * Puerto del patrón adapter (arquitectura, punto 1): el resto del sistema depende
 * solo de esta interfaz. Cambiar de API-Football a Sportradar es implementar esta
 * interfaz de nuevo, sin tocar `sync`, el `probability-engine` ni el frontend.
 */
export interface FootballProvider {
  getFixtures(leagueExternalId: string, from: Date, to: Date): Promise<ProviderFixture[]>;
  getTeamRecentMatches(teamExternalId: string, lastN: number): Promise<ProviderTeamStats>;
  getH2H(teamAExternalId: string, teamBExternalId: string, lastN: number): Promise<ProviderH2H>;
}

export const FOOTBALL_PROVIDER = Symbol('FOOTBALL_PROVIDER');
