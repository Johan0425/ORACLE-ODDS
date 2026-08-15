import { poissonPmf } from './poisson';
import type { ExpectedGoals } from '../types';

/** Suficiente para capturar >99.9% de la masa de probabilidad en fútbol. */
const MAX_GOALS = 10;

export interface GoalMatrixCell {
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

/**
 * Matriz conjunta P(homeGoals = i, awayGoals = j) asumiendo independencia entre
 * ambos marcadores. Base compartida por los mercados que dependen de la diferencia
 * de goles (1X2, hándicap, marcador exacto) para no recalcular la grilla en cada uno.
 */
export function buildGoalProbabilityMatrix(expectedGoals: ExpectedGoals): GoalMatrixCell[] {
  const cells: GoalMatrixCell[] = [];

  for (let homeGoals = 0; homeGoals <= MAX_GOALS; homeGoals++) {
    const pHome = poissonPmf(homeGoals, expectedGoals.home);
    for (let awayGoals = 0; awayGoals <= MAX_GOALS; awayGoals++) {
      const pAway = poissonPmf(awayGoals, expectedGoals.away);
      cells.push({ homeGoals, awayGoals, probability: pHome * pAway });
    }
  }

  return cells;
}
