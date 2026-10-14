import { buildScoreMatrix } from './dixon-coles';

export interface InPlayState {
  lambdaHome: number;
  lambdaAway: number;
  elapsedMinutes: number;
  homeScore: number;
  awayScore: number;
  /** Duración reglamentaria (90 en fútbol). */
  regulationMinutes?: number;
  homeRedCards?: number;
  awayRedCards?: number;
}

export interface InPlayProbabilities {
  remainingFraction: number;
  oneXTwo: { HOME: number; DRAW: number; AWAY: number };
  overUnder: Array<{ line: number; OVER: number; UNDER: number }>;
}

/**
 * Actualización en vivo simple y explícita: los goles restantes siguen Poisson
 * con λ proporcional al tiempo que queda (con ajuste por expulsiones), sumados
 * al marcador actual. No modela ritmo de juego en vivo ni estadísticas del
 * partido en curso; se presenta como tal.
 */
export function inPlayProbabilities(s: InPlayState, lines: number[] = [1.5, 2.5, 3.5]): InPlayProbabilities {
  const total = s.regulationMinutes ?? 90;
  const remainingFraction = Math.max(0, Math.min(1, (total - Math.min(s.elapsedMinutes, total)) / total));
  const redFactor = (own: number, opp: number) => Math.max(0.4, 1 - 0.25 * own + 0.15 * opp);
  const lh = s.lambdaHome * remainingFraction * redFactor(s.homeRedCards ?? 0, s.awayRedCards ?? 0);
  const la = s.lambdaAway * remainingFraction * redFactor(s.awayRedCards ?? 0, s.homeRedCards ?? 0);
  const m = buildScoreMatrix(Math.max(lh, 0), Math.max(la, 0), 0);
  let home = 0;
  let draw = 0;
  let away = 0;
  const totals = new Map<number, number>();
  for (let i = 0; i < m.length; i++) {
    for (let j = 0; j < m[i].length; j++) {
      const fh = s.homeScore + i;
      const fa = s.awayScore + j;
      if (fh > fa) home += m[i][j];
      else if (fh === fa) draw += m[i][j];
      else away += m[i][j];
      totals.set(fh + fa, (totals.get(fh + fa) ?? 0) + m[i][j]);
    }
  }
  return {
    remainingFraction,
    oneXTwo: { HOME: home, DRAW: draw, AWAY: away },
    overUnder: lines.map((line) => {
      let over = 0;
      for (const [t, p] of totals) if (t > line) over += p;
      return { line, OVER: over, UNDER: 1 - over };
    }),
  };
}
