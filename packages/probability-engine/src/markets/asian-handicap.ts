import { buildGoalProbabilityMatrix } from '../models/goal-matrix';
import type { ExpectedGoals } from '../types';

export interface HandicapResult {
  line: number;
  homeCovers: number;
  push: number;
  awayCovers: number;
}

function calculateForSingleLine(expectedGoals: ExpectedGoals, line: number): HandicapResult {
  let homeCovers = 0;
  let push = 0;
  let awayCovers = 0;

  for (const cell of buildGoalProbabilityMatrix(expectedGoals)) {
    const adjustedDiff = cell.homeGoals + line - cell.awayGoals;
    if (adjustedDiff > 0) homeCovers += cell.probability;
    else if (adjustedDiff === 0) push += cell.probability;
    else awayCovers += cell.probability;
  }

  const total = homeCovers + push + awayCovers;
  return { line, homeCovers: homeCovers / total, push: push / total, awayCovers: awayCovers / total };
}

/**
 * Hándicap asiático desde la perspectiva del equipo local (línea negativa = local
 * favorito). Las líneas "de cuarto" (-0.25, -0.75, ...) reparten el stake entre las
 * dos líneas medias adyacentes en el mercado real, así que se modelan promediando
 * el resultado de ambas en vez de tratarlas como una línea independiente.
 */
export function calculateAsianHandicap(expectedGoals: ExpectedGoals, line: number): HandicapResult {
  const isQuarterLine = Math.abs((line * 4) % 1) < 1e-9 && Math.abs((line * 2) % 1) > 1e-9;
  if (!isQuarterLine) return calculateForSingleLine(expectedGoals, line);

  const lower = calculateForSingleLine(expectedGoals, Math.floor(line * 2) / 2);
  const upper = calculateForSingleLine(expectedGoals, Math.ceil(line * 2) / 2);

  return {
    line,
    homeCovers: (lower.homeCovers + upper.homeCovers) / 2,
    push: (lower.push + upper.push) / 2,
    awayCovers: (lower.awayCovers + upper.awayCovers) / 2,
  };
}
