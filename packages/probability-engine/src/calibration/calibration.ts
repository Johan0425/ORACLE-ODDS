/**
 * Calibración binaria de probabilidades. Se ajusta sobre predicciones fuera de
 * muestra (walk-forward) y se serializa en la base de datos con la versión del
 * modelo. Nunca se ajusta sobre los mismos partidos que se evalúan.
 */

export type CalibrationMethod = 'isotonic' | 'platt' | 'identity';

export interface IsotonicParams {
  /** Umbrales de entrada (crecientes) y valores calibrados en cada uno. */
  x: number[];
  y: number[];
}

export interface PlattParams {
  a: number;
  b: number;
}

export type SerializedCalibrator =
  | { method: 'isotonic'; params: IsotonicParams; sampleSize: number }
  | { method: 'platt'; params: PlattParams; sampleSize: number }
  | { method: 'identity'; params: Record<string, never>; sampleSize: number };

const EPS = 1e-6;
const clampP = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));
const logit = (p: number) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Pool Adjacent Violators: regresión isotónica no decreciente. */
export function fitIsotonic(predictions: number[], outcomes: number[]): IsotonicParams {
  const pairs = predictions.map((p, i) => ({ p, y: outcomes[i] })).sort((a, b) => a.p - b.p);
  const blocks: Array<{ sumY: number; count: number; minX: number; maxX: number }> = [];
  for (const { p, y } of pairs) {
    blocks.push({ sumY: y, count: 1, minX: p, maxX: p });
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const prev = blocks[blocks.length - 2];
      if (prev.sumY / prev.count <= last.sumY / last.count) break;
      blocks.splice(blocks.length - 2, 2, {
        sumY: prev.sumY + last.sumY,
        count: prev.count + last.count,
        minX: prev.minX,
        maxX: last.maxX,
      });
    }
  }
  const x: number[] = [];
  const y: number[] = [];
  for (const b of blocks) {
    const value = b.sumY / b.count;
    x.push((b.minX + b.maxX) / 2);
    y.push(value);
  }
  return { x, y };
}

export function predictIsotonic(params: IsotonicParams, p: number): number {
  const { x, y } = params;
  if (x.length === 0) return p;
  if (p <= x[0]) return clampP(y[0]);
  if (p >= x[x.length - 1]) return clampP(y[y.length - 1]);
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (x[mid] <= p) lo = mid;
    else hi = mid;
  }
  const t = (p - x[lo]) / (x[hi] - x[lo] || 1);
  return clampP(y[lo] + t * (y[hi] - y[lo]));
}

/** Platt scaling sobre logit(p): p' = σ(a·logit(p) + b), ajustado por Newton-Raphson. */
export function fitPlatt(predictions: number[], outcomes: number[], iterations = 100): PlattParams {
  let a = 1;
  let b = 0;
  const xs = predictions.map(logit);
  for (let it = 0; it < iterations; it++) {
    let ga = 0;
    let gb = 0;
    let haa = 0;
    let hab = 0;
    let hbb = 0;
    for (let i = 0; i < xs.length; i++) {
      const p = sigmoid(a * xs[i] + b);
      const r = p - outcomes[i];
      const w = p * (1 - p);
      ga += r * xs[i];
      gb += r;
      haa += w * xs[i] * xs[i];
      hab += w * xs[i];
      hbb += w;
    }
    // Pequeña regularización para estabilidad numérica con muestras chicas.
    haa += 1e-6;
    hbb += 1e-6;
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) break;
  }
  return { a, b };
}

export function predictPlatt(params: PlattParams, p: number): number {
  return clampP(sigmoid(params.a * logit(p) + params.b));
}

export interface CalibrationPolicy {
  /** Desde este tamaño se usa regresión isotónica (más flexible, necesita más datos). */
  isotonicMinSamples: number;
  /** Desde este tamaño se usa Platt; por debajo no se calibra. */
  plattMinSamples: number;
}

export const DEFAULT_CALIBRATION_POLICY: CalibrationPolicy = { isotonicMinSamples: 1000, plattMinSamples: 150 };

export function fitCalibrator(
  predictions: number[],
  outcomes: number[],
  policy: CalibrationPolicy = DEFAULT_CALIBRATION_POLICY,
): SerializedCalibrator {
  const n = predictions.length;
  if (n >= policy.isotonicMinSamples) return { method: 'isotonic', params: fitIsotonic(predictions, outcomes), sampleSize: n };
  if (n >= policy.plattMinSamples) return { method: 'platt', params: fitPlatt(predictions, outcomes), sampleSize: n };
  return { method: 'identity', params: {}, sampleSize: n };
}

export function applyCalibrator(calibrator: SerializedCalibrator | null | undefined, p: number): number {
  if (!calibrator) return p;
  switch (calibrator.method) {
    case 'isotonic':
      return predictIsotonic(calibrator.params, p);
    case 'platt':
      return predictPlatt(calibrator.params, p);
    default:
      return p;
  }
}
