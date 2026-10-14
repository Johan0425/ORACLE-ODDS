export interface EloOptions {
  initialRating: number;
  kFactor: number;
  /** Puntos Elo sumados al local al calcular la expectativa. */
  homeAdvantage: number;
  /** Vida media (días) de la regresión a la media por inactividad. */
  inactivityHalfLifeDays: number;
  baseDrawRate: number;
  drawSlope: number;
}

export const DEFAULT_ELO: EloOptions = {
  initialRating: 1500,
  kFactor: 20,
  homeAdvantage: 65,
  inactivityHalfLifeDays: 240,
  baseDrawRate: 0.28,
  drawSlope: 0.4,
};

export interface EloMatch {
  kickoff: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface EloRating {
  rating: number;
  games: number;
  lastPlayed: Date | null;
}

/** Expectativa de puntos del local (victoria = 1, empate = 0.5). */
export function eloExpectedScore(ratingHome: number, ratingAway: number, homeAdvantage = DEFAULT_ELO.homeAdvantage): number {
  return 1 / (1 + 10 ** (-(ratingHome + homeAdvantage - ratingAway) / 400));
}

/** Multiplicador por diferencia de goles (World Football Elo). */
export function goalDifferenceMultiplier(goalDiff: number): number {
  const gd = Math.abs(goalDiff);
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

/** Regresa el rating hacia la media según los días sin jugar. */
export function regressToMean(rating: number, mean: number, daysInactive: number, halfLifeDays: number): number {
  if (daysInactive <= 0) return rating;
  const keep = 0.5 ** (daysInactive / halfLifeDays);
  // Solo se regresa el exceso por encima de una pretemporada (~60 días) — la inactividad normal entre jornadas no cuenta.
  const effectiveKeep = daysInactive < 60 ? 1 : keep;
  return mean + (rating - mean) * effectiveKeep;
}

/**
 * Recorre partidos en orden cronológico y devuelve los ratings vigentes en
 * `cutoff`. Lanza si recibe partidos posteriores al corte: la función se usa
 * para generar features sin fuga de información.
 */
export function computeEloRatings(matches: EloMatch[], cutoff: Date, options: Partial<EloOptions> = {}): Map<string, EloRating> {
  const opts = { ...DEFAULT_ELO, ...options };
  const ratings = new Map<string, EloRating>();
  const get = (id: string) => ratings.get(id) ?? { rating: opts.initialRating, games: 0, lastPlayed: null };
  const sorted = [...matches].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());

  for (const m of sorted) {
    if (m.kickoff.getTime() >= cutoff.getTime()) {
      throw new Error(`Fuga de datos: partido ${m.kickoff.toISOString()} posterior al corte ${cutoff.toISOString()}`);
    }
    const home = withInactivity(get(m.homeTeamId), m.kickoff, opts);
    const away = withInactivity(get(m.awayTeamId), m.kickoff, opts);
    const expected = eloExpectedScore(home.rating, away.rating, opts.homeAdvantage);
    const actual = m.homeGoals > m.awayGoals ? 1 : m.homeGoals === m.awayGoals ? 0.5 : 0;
    const delta = opts.kFactor * goalDifferenceMultiplier(m.homeGoals - m.awayGoals) * (actual - expected);
    ratings.set(m.homeTeamId, { rating: home.rating + delta, games: home.games + 1, lastPlayed: m.kickoff });
    ratings.set(m.awayTeamId, { rating: away.rating - delta, games: away.games + 1, lastPlayed: m.kickoff });
  }

  for (const [id, r] of ratings) ratings.set(id, withInactivity(r, cutoff, opts));
  return ratings;
}

function withInactivity(r: EloRating, at: Date, opts: EloOptions): EloRating {
  if (!r.lastPlayed) return r;
  const days = (at.getTime() - r.lastPlayed.getTime()) / 86_400_000;
  return { ...r, rating: regressToMean(r.rating, opts.initialRating, days, opts.inactivityHalfLifeDays) };
}

/**
 * Convierte la expectativa Elo en 1X2. El empate decrece linealmente cuanto más
 * desequilibrado es el partido; el resto se reparte para respetar la
 * expectativa de puntos: E = P(local) + P(empate)/2.
 */
export function eloToOneXTwo(expectedScore: number, options: Partial<EloOptions> = {}): { home: number; draw: number; away: number } {
  const opts = { ...DEFAULT_ELO, ...options };
  let draw = Math.max(0.05, opts.baseDrawRate - opts.drawSlope * Math.abs(expectedScore - 0.5));
  let home = expectedScore - draw / 2;
  let away = 1 - expectedScore - draw / 2;
  if (home < 0.01) {
    home = 0.01;
    draw = 2 * (expectedScore - home);
    away = 1 - home - draw;
  }
  if (away < 0.01) {
    away = 0.01;
    draw = 2 * (1 - expectedScore - away);
    home = 1 - away - draw;
  }
  return { home, draw, away };
}
