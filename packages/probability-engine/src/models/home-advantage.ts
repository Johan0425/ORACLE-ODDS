/** Factor multiplicativo típico de ventaja de local en ligas de fútbol (1.0 = sin ventaja). */
export const DEFAULT_HOME_ADVANTAGE = 1.2;

export function applyHomeAdvantage(expectedGoals: number, factor: number = DEFAULT_HOME_ADVANTAGE): number {
  return expectedGoals * factor;
}
