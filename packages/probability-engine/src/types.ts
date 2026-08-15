export interface TeamMatchSample {
  goalsFor: number;
  goalsAgainst: number;
  /** Córners a favor de este equipo en el partido, si el dato está disponible. */
  corners?: number;
  /** Tarjetas (amarillas + rojas) recibidas por este equipo en el partido, si el dato está disponible. */
  cards?: number;
}

export interface TeamRecentData {
  teamId: string;
  teamName: string;
  /** Ordenados de más reciente a más antiguo — el índice 0 es el último partido jugado. */
  recentMatches: TeamMatchSample[];
}

export interface H2HMatchSample {
  totalGoals: number;
}

export interface LeagueGoalContext {
  /** Promedio de liga de goles marcados por el equipo que juega de local. */
  avgHomeGoalsScored: number;
  /** Promedio de liga de goles marcados por el equipo que juega de visitante. */
  avgAwayGoalsScored: number;
}

/** Estimación de un total esperado por lado (goles, córners o tarjetas) para un partido. */
export interface ExpectedCount {
  home: number;
  away: number;
}

/** Alias histórico — `ExpectedCount` es el nombre genérico, este queda por compatibilidad. */
export type ExpectedGoals = ExpectedCount;

export interface FixtureProbabilityInput {
  home: TeamRecentData;
  away: TeamRecentData;
  h2h: H2HMatchSample[];
  league: LeagueGoalContext;
  homeAdvantageFactor?: number;
  /** Líneas de over/under de goles a evaluar, ej. [1.5, 2.5, 3.5]. Default: [2.5]. */
  overUnderLines?: number[];
  /** Líneas de hándicap asiático a evaluar (desde la perspectiva del local), ej. [-1, -0.5]. Default: [-0.5]. */
  handicapLines?: number[];
  /** Líneas de over/under de córners a evaluar. Default: [9.5]. Se omite si no hay datos de córners en el historial. */
  cornersLines?: number[];
  /** Líneas de over/under de tarjetas a evaluar. Default: [3.5]. Se omite si no hay datos de tarjetas en el historial. */
  cardsLines?: number[];
}
