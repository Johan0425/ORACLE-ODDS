import { calculateOverUnderFromTotal, type OverUnderResult } from './over-under';
import type { ExpectedCount } from '../types';

export function calculateCornersOverUnder(expectedCorners: ExpectedCount, line: number): OverUnderResult {
  return calculateOverUnderFromTotal(expectedCorners.home + expectedCorners.away, line);
}

export function calculateCardsOverUnder(expectedCards: ExpectedCount, line: number): OverUnderResult {
  return calculateOverUnderFromTotal(expectedCards.home + expectedCards.away, line);
}
