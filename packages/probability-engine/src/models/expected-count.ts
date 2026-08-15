import { weightedAverage } from './weighted-form';
import type { ExpectedCount, TeamMatchSample, TeamRecentData } from '../types';

/** Ventaja de local leve para córners/tarjetas — mucho menor que la de goles (1.2x). */
const HOME_NUDGE = 1.05;

/**
 * Estimación simple por promedio ponderado (no el modelo cruzado de ataque/defensa
 * de `expected-goals.ts`): para córners y tarjetas no hay una noción tan clara de
 * "fuerza ofensiva vs. defensiva del rival" como con los goles, así que se pondera
 * el propio historial de cada equipo directamente — la "regresión simple" del plan
 * original del motor.
 */
export function estimateExpectedCount(
  home: TeamRecentData,
  away: TeamRecentData,
  pick: (match: TeamMatchSample) => number | undefined,
): ExpectedCount | null {
  const homeValues = home.recentMatches.map(pick).filter((v): v is number => v != null);
  const awayValues = away.recentMatches.map(pick).filter((v): v is number => v != null);

  // Sin datos suficientes (el proveedor/seed no trae córners o tarjetas para este
  // partido), no se inventa un número — el mercado simplemente no se calcula.
  if (homeValues.length === 0 || awayValues.length === 0) return null;

  return {
    home: weightedAverage(homeValues) * HOME_NUDGE,
    away: weightedAverage(awayValues),
  };
}

export function estimateExpectedCorners(home: TeamRecentData, away: TeamRecentData): ExpectedCount | null {
  return estimateExpectedCount(home, away, (m) => m.corners);
}

export function estimateExpectedCards(home: TeamRecentData, away: TeamRecentData): ExpectedCount | null {
  return estimateExpectedCount(home, away, (m) => m.cards);
}
