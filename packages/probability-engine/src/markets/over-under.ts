import { poissonCdf, poissonPmf } from '../models/poisson';
import type { ExpectedCount } from '../types';

export interface OverUnderResult {
  line: number;
  over: number;
  under: number;
  /** Solo distinto de 0 cuando la línea es un entero (infrecuente en over/under de goles). */
  push: number;
}

/**
 * La suma de dos variables Poisson independientes es a su vez Poisson(lambda_home +
 * lambda_away), así que el total (goles, córners o tarjetas) se modela directamente
 * sobre esa distribución combinada, sin necesitar la matriz conjunta completa. Sirve
 * para cualquier mercado de "total" — no solo goles.
 */
export function calculateOverUnderFromTotal(lambdaTotal: number, line: number): OverUnderResult {
  if (Number.isInteger(line)) {
    const push = poissonPmf(line, lambdaTotal);
    const under = poissonCdf(line - 1, lambdaTotal);
    return { line, over: 1 - under - push, under, push };
  }

  const under = poissonCdf(Math.floor(line), lambdaTotal);
  return { line, over: 1 - under, under, push: 0 };
}

export function calculateOverUnder(expectedGoals: ExpectedCount, line: number): OverUnderResult {
  return calculateOverUnderFromTotal(expectedGoals.home + expectedGoals.away, line);
}
