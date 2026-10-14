import { poissonPmf } from './poisson';

/** Matriz P(local = i, visitante = j), indexada [i][j]. */
export type ScoreMatrix = number[][];

export const DEFAULT_MAX_GOALS = 10;
/** Valor típico de ρ estimado en ligas europeas; negativo = más 0-0/1-1 de lo que predice Poisson independiente. */
export const DEFAULT_DIXON_COLES_RHO = -0.08;

/**
 * Factor de corrección τ de Dixon & Coles (1997) para marcadores bajos. Solo
 * altera las celdas 0-0, 1-0, 0-1 y 1-1, donde la independencia de Poisson
 * falla de forma documentada en fútbol.
 */
export function dixonColesTau(homeGoals: number, awayGoals: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

/** Restringe ρ al rango donde τ ≥ 0 para todas las celdas afectadas. */
export function clampRho(rho: number, lambdaHome: number, lambdaAway: number): number {
  const lower = Math.max(-1 / Math.max(lambdaHome, 1e-9), -1 / Math.max(lambdaAway, 1e-9));
  const upper = Math.min(1 / Math.max(lambdaHome * lambdaAway, 1e-9), 1);
  return Math.max(lower, Math.min(upper, rho));
}

/** Matriz de marcadores con corrección Dixon-Coles, normalizada para sumar 1. */
export function buildScoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DEFAULT_DIXON_COLES_RHO,
  maxGoals: number = DEFAULT_MAX_GOALS,
): ScoreMatrix {
  const r = clampRho(rho, lambdaHome, lambdaAway);
  const matrix: ScoreMatrix = [];
  let total = 0;
  for (let i = 0; i <= maxGoals; i++) {
    matrix[i] = [];
    const ph = poissonPmf(i, lambdaHome);
    for (let j = 0; j <= maxGoals; j++) {
      const p = ph * poissonPmf(j, lambdaAway) * dixonColesTau(i, j, lambdaHome, lambdaAway, r);
      matrix[i][j] = p;
      total += p;
    }
  }
  for (let i = 0; i <= maxGoals; i++) for (let j = 0; j <= maxGoals; j++) matrix[i][j] /= total;
  return matrix;
}

/** Suma de probabilidad de las celdas que cumplen el predicado. */
export function sumMatrix(matrix: ScoreMatrix, predicate: (home: number, away: number) => boolean): number {
  let sum = 0;
  for (let i = 0; i < matrix.length; i++) for (let j = 0; j < matrix[i].length; j++) if (predicate(i, j)) sum += matrix[i][j];
  return sum;
}

/**
 * Estima ρ por máxima verosimilitud (búsqueda en grilla) sobre partidos ya
 * jugados y sus λ predichos fuera de muestra. Con pocos partidos devuelve el
 * valor por defecto para no sobreajustar.
 */
export function estimateRho(
  samples: Array<{ lambdaHome: number; lambdaAway: number; homeGoals: number; awayGoals: number }>,
  minSamples = 200,
): number {
  if (samples.length < minSamples) return DEFAULT_DIXON_COLES_RHO;
  let bestRho = DEFAULT_DIXON_COLES_RHO;
  let bestLl = -Infinity;
  for (let rho = -0.25; rho <= 0.1001; rho += 0.005) {
    let ll = 0;
    for (const s of samples) {
      const tau = dixonColesTau(s.homeGoals, s.awayGoals, s.lambdaHome, s.lambdaAway, clampRho(rho, s.lambdaHome, s.lambdaAway));
      ll += Math.log(Math.max(tau, 1e-12));
    }
    if (ll > bestLl) {
      bestLl = ll;
      bestRho = rho;
    }
  }
  return Math.round(bestRho * 1000) / 1000;
}
