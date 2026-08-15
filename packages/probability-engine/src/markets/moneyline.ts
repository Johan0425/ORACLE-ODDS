import { buildGoalProbabilityMatrix } from '../models/goal-matrix';
import type { ExpectedGoals } from '../types';

export interface MoneylineResult {
  homeWin: number;
  draw: number;
  awayWin: number;
}

/** Mercado 1X2 a partir de la matriz conjunta de goles esperados. */
export function calculateMoneyline(expectedGoals: ExpectedGoals): MoneylineResult {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (const cell of buildGoalProbabilityMatrix(expectedGoals)) {
    if (cell.homeGoals > cell.awayGoals) homeWin += cell.probability;
    else if (cell.homeGoals === cell.awayGoals) draw += cell.probability;
    else awayWin += cell.probability;
  }

  // Renormaliza por la masa truncada al límite de la grilla (MAX_GOALS en goal-matrix).
  const total = homeWin + draw + awayWin;
  return { homeWin: homeWin / total, draw: draw / total, awayWin: awayWin / total };
}
