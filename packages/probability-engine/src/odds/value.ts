import { assertValidDecimalOdds } from './conversion';

/** Ventaja del modelo sobre el mercado sin margen, en puntos de probabilidad. */
export function edge(modelProbability: number, marketProbabilityNoVig: number): number {
  return modelProbability - marketProbabilityNoVig;
}

/** Valor esperado por unidad apostada a la cuota ofrecida: p·o − 1. */
export function expectedValue(modelProbability: number, decimalOdds: number): number {
  assertValidDecimalOdds(decimalOdds);
  return modelProbability * decimalOdds - 1;
}

export interface KellyOptions {
  /** Fracción de Kelly aplicada (0.25 = cuarto de Kelly). */
  fraction?: number;
  /** Tamaño del bankroll expresado en unidades. */
  bankrollUnits?: number;
  /** Tope de unidades por selección. */
  maxUnits?: number;
  /** Redondeo del stake sugerido (en unidades). */
  step?: number;
}

export const DEFAULT_KELLY: Required<KellyOptions> = { fraction: 0.25, bankrollUnits: 100, maxUnits: 2, step: 0.25 };

/** Kelly completo: f* = (b·p − q) / b, con b = cuota − 1. Puede ser negativo (no apostar). */
export function kellyFraction(probability: number, decimalOdds: number): number {
  assertValidDecimalOdds(decimalOdds);
  const b = decimalOdds - 1;
  return (b * probability - (1 - probability)) / b;
}

/**
 * Stake sugerido en unidades con Kelly fraccional y tope. Nunca negativo, nunca
 * por encima de `maxUnits`. Es una cifra educativa para simulación.
 */
export function suggestedStakeUnits(probability: number, decimalOdds: number, options: KellyOptions = {}): number {
  const opts = { ...DEFAULT_KELLY, ...options };
  const full = kellyFraction(probability, decimalOdds);
  if (full <= 0) return 0;
  const raw = full * opts.fraction * opts.bankrollUnits;
  const capped = Math.min(raw, opts.maxUnits);
  return Math.floor(capped / opts.step) * opts.step;
}

export interface FreshnessThresholds {
  /** Hasta esta edad (segundos) la cuota se considera completamente fresca. */
  freshSeconds: number;
  /** A partir de esta edad la cuota se considera vencida (score 0). */
  staleSeconds: number;
}

export const PREMATCH_FRESHNESS: FreshnessThresholds = { freshSeconds: 15 * 60, staleSeconds: 2 * 60 * 60 };
export const LIVE_FRESHNESS: FreshnessThresholds = { freshSeconds: 20, staleSeconds: 120 };

/** 1 = recién capturada, 0 = vencida. Decae linealmente entre ambos umbrales. */
export function freshnessScore(ageSeconds: number, thresholds: FreshnessThresholds = PREMATCH_FRESHNESS): number {
  if (ageSeconds <= thresholds.freshSeconds) return 1;
  if (ageSeconds >= thresholds.staleSeconds) return 0;
  return 1 - (ageSeconds - thresholds.freshSeconds) / (thresholds.staleSeconds - thresholds.freshSeconds);
}

export function isStale(ageSeconds: number, thresholds: FreshnessThresholds = PREMATCH_FRESHNESS): boolean {
  return ageSeconds >= thresholds.staleSeconds;
}

export interface QualityInput {
  edge: number;
  expectedValue: number;
  /** 0..1: calidad de calibración del modelo para este mercado (1 − ECE normalizado). */
  calibrationQuality: number;
  freshness: number;
  /** Casas autorizadas con cuota para esta selección. */
  bookmakerCount: number;
  /** Ancho del intervalo de incertidumbre (upper − lower). */
  uncertaintyWidth: number;
  lineupsKnown: boolean;
  /** Minutos hasta el inicio (negativo = ya empezó). */
  minutesToKickoff: number;
  lowLiquidityMarket: boolean;
  /** Variación relativa de la cuota desde apertura (+0.10 = la cuota subió 10%). */
  priceMoveFromOpening: number | null;
  dataQuality: number;
}

export interface QualityResult {
  score: number;
  penalties: Array<{ code: string; label: string; factor: number }>;
}

/**
 * Puntaje 0-100 que combina magnitud del valor con la fiabilidad del dato. Un
 * edge enorme con cuota vencida o modelo mal calibrado obtiene puntaje bajo.
 */
export function qualityScore(input: QualityInput): QualityResult {
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const base =
    25 * clamp(input.edge / 0.08) +
    20 * clamp(input.expectedValue / 0.15) +
    15 * clamp(input.calibrationQuality) +
    15 * clamp(input.freshness) +
    10 * clamp(input.bookmakerCount / 5) +
    15 * clamp(1 - input.uncertaintyWidth / 0.3);

  const penalties: QualityResult['penalties'] = [];
  const penalize = (code: string, label: string, factor: number) => penalties.push({ code, label, factor });

  if (input.freshness < 0.5) penalize('STALE_ODDS', 'Cuota con más de la mitad de su vida útil consumida', 0.7);
  if (input.bookmakerCount < 3) penalize('LOW_COVERAGE', 'Pocas casas cotizan esta selección', 0.85);
  if (input.calibrationQuality < 0.6) penalize('POOR_CALIBRATION', 'Calibración del modelo débil en este mercado', 0.7);
  if (!input.lineupsKnown && input.minutesToKickoff < 60) {
    penalize('LINEUPS_UNKNOWN', 'Alineaciones no confirmadas cerca del inicio', 0.9);
  }
  if (input.lowLiquidityMarket) penalize('LOW_LIQUIDITY', 'Mercado de baja liquidez', 0.85);
  if (input.uncertaintyWidth > 0.2) penalize('HIGH_UNCERTAINTY', 'Intervalo de incertidumbre amplio', 0.85);
  if (input.priceMoveFromOpening != null && input.priceMoveFromOpening > 0.08) {
    penalize('ADVERSE_MOVE', 'La cuota se alejó de la selección desde la apertura', 0.8);
  }
  if (input.dataQuality < 0.6) penalize('LOW_DATA_QUALITY', 'Datos históricos incompletos', 0.8);

  const score = penalties.reduce((acc, p) => acc * p.factor, base);
  return { score: Math.round(Math.max(0, Math.min(100, score)) * 10) / 10, penalties };
}
