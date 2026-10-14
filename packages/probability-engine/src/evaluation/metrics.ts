/** Métricas de evaluación probabilística y de rendimiento de apuestas simuladas. */

const EPS = 1e-12;

function assertSameLength(a: unknown[], b: unknown[]): void {
  if (a.length !== b.length) throw new RangeError('Las predicciones y los resultados deben tener la misma longitud');
}

/** Brier score binario: media de (p − y)². 0 = perfecto, 0.25 = moneda al aire con p = 0.5. */
export function brierScore(predictions: number[], outcomes: number[]): number {
  assertSameLength(predictions, outcomes);
  if (predictions.length === 0) return NaN;
  return predictions.reduce((s, p, i) => s + (p - outcomes[i]) ** 2, 0) / predictions.length;
}

/** Brier multiclase (p. ej. 1X2): suma sobre clases de (p_k − y_k)², promediada por evento. */
export function multiclassBrier(predictions: number[][], outcomeIndex: number[]): number {
  assertSameLength(predictions, outcomeIndex);
  if (predictions.length === 0) return NaN;
  let total = 0;
  predictions.forEach((probs, i) => probs.forEach((p, k) => (total += (p - (k === outcomeIndex[i] ? 1 : 0)) ** 2)));
  return total / predictions.length;
}

export function logLoss(predictions: number[], outcomes: number[]): number {
  assertSameLength(predictions, outcomes);
  if (predictions.length === 0) return NaN;
  return (
    -predictions.reduce((s, p, i) => {
      const q = Math.min(1 - EPS, Math.max(EPS, p));
      return s + (outcomes[i] ? Math.log(q) : Math.log(1 - q));
    }, 0) / predictions.length
  );
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  count: number;
  meanPredicted: number;
  observedRate: number;
}

export function reliabilityCurve(predictions: number[], outcomes: number[], bins = 10): ReliabilityBin[] {
  assertSameLength(predictions, outcomes);
  const result: ReliabilityBin[] = Array.from({ length: bins }, (_, b) => ({
    lower: b / bins,
    upper: (b + 1) / bins,
    count: 0,
    meanPredicted: 0,
    observedRate: 0,
  }));
  predictions.forEach((p, i) => {
    const b = Math.min(bins - 1, Math.floor(p * bins));
    result[b].count += 1;
    result[b].meanPredicted += p;
    result[b].observedRate += outcomes[i];
  });
  for (const bin of result) {
    if (bin.count > 0) {
      bin.meanPredicted /= bin.count;
      bin.observedRate /= bin.count;
    }
  }
  return result;
}

/** Expected Calibration Error: diferencia media ponderada entre confianza y frecuencia observada. */
export function expectedCalibrationError(predictions: number[], outcomes: number[], bins = 10): number {
  if (predictions.length === 0) return NaN;
  const curve = reliabilityCurve(predictions, outcomes, bins);
  return curve.reduce((s, b) => s + (b.count / predictions.length) * Math.abs(b.meanPredicted - b.observedRate), 0);
}

export function accuracy(predictions: number[], outcomes: number[], threshold = 0.5): number {
  assertSameLength(predictions, outcomes);
  if (predictions.length === 0) return NaN;
  return predictions.filter((p, i) => (p >= threshold ? 1 : 0) === outcomes[i]).length / predictions.length;
}

export interface SettledBet {
  stake: number;
  odds: number;
  profit: number;
  outcome: 'WIN' | 'LOSS' | 'PUSH' | 'HALF_WIN' | 'HALF_LOSS' | 'VOID';
  closingOdds?: number | null;
  settledAt?: Date;
}

export interface BettingMetrics {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  staked: number;
  profit: number;
  /** Beneficio / total apostado. */
  roi: number;
  /** Beneficio medio por apuesta en unidades (yield por unidad apostada). */
  yieldPerBet: number;
  hitRate: number;
  maxDrawdown: number;
  /** CLV medio: cuota tomada / cuota de cierre − 1. Positivo = se batió al cierre. */
  avgClv: number | null;
  clvSample: number;
}

export function bettingMetrics(bets: SettledBet[]): BettingMetrics {
  const ordered = [...bets].sort((a, b) => (a.settledAt?.getTime() ?? 0) - (b.settledAt?.getTime() ?? 0));
  let staked = 0;
  let profit = 0;
  let peak = 0;
  let maxDd = 0;
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let voids = 0;
  let clvSum = 0;
  let clvN = 0;
  for (const b of ordered) {
    if (b.outcome === 'VOID') {
      voids += 1;
      continue;
    }
    staked += b.stake;
    profit += b.profit;
    peak = Math.max(peak, profit);
    maxDd = Math.max(maxDd, peak - profit);
    if (b.outcome === 'WIN' || b.outcome === 'HALF_WIN') wins += 1;
    else if (b.outcome === 'LOSS' || b.outcome === 'HALF_LOSS') losses += 1;
    else pushes += 1;
    if (b.closingOdds && b.closingOdds > 1) {
      clvSum += b.odds / b.closingOdds - 1;
      clvN += 1;
    }
  }
  const decided = wins + losses;
  const settled = ordered.length - voids;
  return {
    bets: settled,
    wins,
    losses,
    pushes,
    voids,
    staked,
    profit,
    roi: staked > 0 ? profit / staked : 0,
    yieldPerBet: settled > 0 ? profit / settled : 0,
    hitRate: decided > 0 ? wins / decided : 0,
    maxDrawdown: maxDd,
    avgClv: clvN > 0 ? clvSum / clvN : null,
    clvSample: clvN,
  };
}

/** Generador pseudoaleatorio determinista (mulberry32) para que los intervalos sean reproducibles. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Intervalo bootstrap por percentiles de un estadístico sobre una muestra. */
export function bootstrapInterval<T>(
  sample: T[],
  statistic: (s: T[]) => number,
  options: { iterations?: number; confidence?: number; seed?: number } = {},
): { lower: number; upper: number } | null {
  const { iterations = 1000, confidence = 0.95, seed = 42 } = options;
  if (sample.length < 2) return null;
  const rand = seededRandom(seed);
  const stats: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const resample = Array.from({ length: sample.length }, () => sample[Math.floor(rand() * sample.length)]);
    stats.push(statistic(resample));
  }
  stats.sort((a, b) => a - b);
  const alpha = (1 - confidence) / 2;
  return { lower: stats[Math.floor(alpha * iterations)], upper: stats[Math.min(iterations - 1, Math.ceil((1 - alpha) * iterations) - 1)] };
}

export interface TimeOrdered {
  at: Date;
}

/**
 * Partición temporal (sin mezclar): entrenamiento → calibración → prueba. Evita
 * que el calibrador o la evaluación vean el futuro del entrenamiento.
 */
export function walkForwardSplit<T extends TimeOrdered>(items: T[], trainFraction = 0.6, calibrationFraction = 0.2): { train: T[]; calibration: T[]; test: T[] } {
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime());
  const trainEnd = Math.floor(sorted.length * trainFraction);
  const calEnd = Math.floor(sorted.length * (trainFraction + calibrationFraction));
  return { train: sorted.slice(0, trainEnd), calibration: sorted.slice(trainEnd, calEnd), test: sorted.slice(calEnd) };
}

/** Cubetas de cuota para segmentar métricas. */
export function oddsBucket(odds: number): string {
  if (odds < 1.5) return '1.01-1.49';
  if (odds < 2) return '1.50-1.99';
  if (odds < 3) return '2.00-2.99';
  if (odds < 5) return '3.00-4.99';
  return '5.00+';
}
