const DEFAULT_DECAY = 0.85;

/**
 * Promedio móvil ponderado: el partido más reciente (índice 0) pesa más que los
 * anteriores, decayendo geométricamente. Implementa la "ponderación por racha
 * reciente" pedida para el motor de probabilidades.
 */
export function weightedAverage(valuesNewestFirst: number[], decay: number = DEFAULT_DECAY): number {
  if (valuesNewestFirst.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  valuesNewestFirst.forEach((value, index) => {
    const weight = Math.pow(decay, index);
    weightedSum += value * weight;
    weightTotal += weight;
  });

  return weightedSum / weightTotal;
}
