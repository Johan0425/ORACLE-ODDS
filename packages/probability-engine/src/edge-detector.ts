export interface EdgeResult {
  /** Probabilidad del modelo menos la probabilidad implícita de mercado (ya sin overround). */
  edge: number;
  /** Edge expresado en relación a la probabilidad implícita de mercado. */
  edgePercentage: number;
  hasValue: boolean;
}

/** Diferencia mínima (5 puntos porcentuales) para considerar el edge explotable. */
const VALUE_THRESHOLD = 0.05;

/**
 * Elimina el margen de la casa (overround) normalizando las cuotas de TODAS las
 * selecciones de un mismo mercado para que sus probabilidades implícitas sumen 1.
 * Usar 1/cuota de una sola selección sobreestima la probabilidad real por el vigorish.
 */
export function normalizeImpliedProbabilities(decimalOdds: number[]): number[] {
  const rawImplied = decimalOdds.map((odds) => 1 / odds);
  const overround = rawImplied.reduce((sum, p) => sum + p, 0);
  return rawImplied.map((p) => p / overround);
}

export function detectEdge(modelProbability: number, marketImpliedProbability: number): EdgeResult {
  const edge = modelProbability - marketImpliedProbability;
  return {
    edge,
    edgePercentage: edge / marketImpliedProbability,
    hasValue: Math.abs(edge) >= VALUE_THRESHOLD,
  };
}
