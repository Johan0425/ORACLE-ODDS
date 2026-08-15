export interface TeamMatchSample {
  goalsFor: number;
  goalsAgainst: number;
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

export interface ExpectedGoals {
  home: number;
  away: number;
}

export interface FixtureProbabilityInput {
  home: TeamRecentData;
  away: TeamRecentData;
  h2h: H2HMatchSample[];
  league: LeagueGoalContext;
  homeAdvantageFactor?: number;
  /** Líneas de over/under a evaluar, ej. [1.5, 2.5, 3.5]. Default: [2.5]. */
  overUnderLines?: number[];
  /** Líneas de hándicap asiático a evaluar (desde la perspectiva del local), ej. [-1, -0.5]. Default: [-0.5]. */
  handicapLines?: number[];
}
