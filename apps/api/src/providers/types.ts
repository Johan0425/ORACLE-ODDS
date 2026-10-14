import type { DataProvider, FixtureStatus, SportKey } from '@prisma/client';

/**
 * Modelo intermedio normalizado. Los adaptadores traducen la respuesta de cada
 * proveedor a estas formas; la capa de normalización las resuelve a entidades
 * canónicas. Ningún campo se rellena con valores inventados: si el proveedor no
 * lo trae, queda `null`/`undefined`.
 */

export interface ExternalRef {
  provider: DataProvider;
  externalId: string;
}

export interface NormalizedCountry {
  code: string | null;
  name: string;
  flagUrl?: string | null;
}

export interface NormalizedLeague {
  ref: ExternalRef;
  sport: SportKey;
  name: string;
  country: NormalizedCountry | null;
  type?: string | null;
  logoUrl?: string | null;
  season?: { label: string; year?: number | null; start?: Date | null; end?: Date | null; current?: boolean } | null;
}

export interface NormalizedTeam {
  ref: ExternalRef;
  sport: SportKey;
  name: string;
  shortName?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  venueName?: string | null;
}

export interface NormalizedFixture {
  ref: ExternalRef;
  sport: SportKey;
  league: NormalizedLeague;
  home: NormalizedTeam;
  away: NormalizedTeam;
  kickoff: Date;
  status: FixtureStatus;
  statusDetail?: string | null;
  elapsedMinutes?: number | null;
  period?: string | null;
  venue?: string | null;
  round?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  htHomeScore?: number | null;
  htAwayScore?: number | null;
  /** Momento en que el proveedor generó el dato (para estimar latencia en vivo). */
  sourceTimestamp?: Date | null;
}

export interface NormalizedTeamStats {
  fixtureRef: ExternalRef;
  teamRef: ExternalRef;
  corners?: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  shotsOnGoal?: number | null;
  shotsTotal?: number | null;
  possession?: number | null;
  expectedGoals?: number | null;
  raw: Record<string, unknown>;
}

export interface NormalizedEvent {
  fixtureRef: ExternalRef;
  teamRef?: ExternalRef | null;
  minute: number;
  extraMinute?: number | null;
  type: string;
  detail?: string | null;
  playerName?: string | null;
  assistName?: string | null;
}

export interface NormalizedLineup {
  fixtureRef: ExternalRef;
  teamRef: ExternalRef;
  formation?: string | null;
  coach?: string | null;
  startXI: Array<{ name: string; number?: number | null; position?: string | null; externalId?: string | null }>;
  substitutes: Array<{ name: string; number?: number | null; position?: string | null; externalId?: string | null }>;
}

export interface NormalizedInjury {
  fixtureRef?: ExternalRef | null;
  teamRef: ExternalRef;
  playerRef: ExternalRef;
  playerName: string;
  status: string;
  reason?: string | null;
}

export interface NormalizedStanding {
  leagueRef: ExternalRef;
  season: string;
  group?: string | null;
  team: NormalizedTeam;
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  form?: string | null;
}

export interface NormalizedBookmaker {
  key: string;
  name: string;
}

export interface NormalizedPrice {
  bookmaker: NormalizedBookmaker;
  marketKey: string;
  selectionKey: string;
  line: number | null;
  priceDecimal: number;
  isLive: boolean;
  isSuspended: boolean;
  sourceTimestamp: Date;
  directBetUrl?: string | null;
}

/** Evento de cuotas de un proveedor; puede no tener todavía partido canónico asociado. */
export interface NormalizedOddsEvent {
  ref: ExternalRef;
  sport: SportKey;
  /** Clave de competición del proveedor (p. ej. sport_key de The Odds API). */
  competitionKey: string;
  competitionName?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: Date;
  /** Si el proveedor de cuotas ya referencia un partido de otro proveedor (API-Football odds). */
  fixtureRef?: ExternalRef | null;
  prices: NormalizedPrice[];
}

export interface NormalizedScoreUpdate {
  ref: ExternalRef;
  completed: boolean;
  homeScore: number | null;
  awayScore: number | null;
  lastUpdate: Date | null;
}
