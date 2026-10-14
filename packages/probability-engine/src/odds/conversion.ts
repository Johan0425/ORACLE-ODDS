/** Conversión entre formatos de cuota. Todas las funciones trabajan con cuota decimal como formato canónico. */

export function assertValidDecimalOdds(odds: number): void {
  if (!Number.isFinite(odds) || odds <= 1) {
    throw new RangeError(`Cuota decimal inválida: ${odds} (debe ser > 1)`);
  }
}

/** Probabilidad implícita bruta: incluye el margen de la casa. */
export function impliedProbability(decimalOdds: number): number {
  assertValidDecimalOdds(decimalOdds);
  return 1 / decimalOdds;
}

/** Cuota justa (sin margen) para una probabilidad dada. */
export function fairOdds(probability: number): number {
  if (!(probability > 0 && probability <= 1)) {
    throw new RangeError(`Probabilidad inválida para cuota justa: ${probability}`);
  }
  return 1 / probability;
}

export function americanToDecimal(american: number): number {
  if (!Number.isFinite(american) || american === 0 || Math.abs(american) < 100) {
    throw new RangeError(`Cuota americana inválida: ${american}`);
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  assertValidDecimalOdds(decimal);
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

export function fractionalToDecimal(numerator: number, denominator: number): number {
  if (!(numerator > 0 && denominator > 0)) throw new RangeError('Cuota fraccional inválida');
  return 1 + numerator / denominator;
}

/** Hong Kong / Malaya / Indonesia no se exponen: los proveedores integrados entregan decimal o americano. */
export function roundOdds(decimal: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(decimal * factor) / factor;
}
