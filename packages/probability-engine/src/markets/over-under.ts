import { poissonCdf, poissonPmf } from '../models/poisson';
import type { ExpectedGoals } from '../types';

export interface OverUnderResult {
  line: number;
  over: number;
  under: number;
  /** Solo distinto de 0 cuando la línea es un entero (infrecuente en over/under de goles). */
  push: number;
}

/**
 * La suma de dos variables Poisson independientes es a su vez Poisson(lambda_home +
 * lambda_away), así que el total de goles del partido se modela directamente sobre
 * esa distribución combinada, sin necesitar la matriz conjunta completa.
 */
export function calculateOverUnder(expectedGoals: ExpectedGoals, line: number): OverUnderResult {
  const lambdaTotal = expectedGoals.home + expectedGoals.away;

  if (Number.isInteger(line)) {
    const push = poissonPmf(line, lambdaTotal);
    const under = poissonCdf(line - 1, lambdaTotal);
    return { line, over: 1 - under - push, under, push };
  }

  const under = poissonCdf(Math.floor(line), lambdaTotal);
  return { line, over: 1 - under, under, push: 0 };
}
