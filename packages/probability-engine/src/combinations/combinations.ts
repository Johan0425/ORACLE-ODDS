import { settleSelection, winWeight } from '../settlement/settle';
import { isGoalMatrixMarket } from '../markets/distribution';
import type { ScoreMatrix } from '../models/dixon-coles';

export interface ComboLeg {
  id: string;
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  line?: number | null;
  odds: number;
  /** Probabilidad calibrada del modelo para esta selección (si existe). */
  probability?: number | null;
  kickoff?: Date | null;
  oddsCapturedAt?: Date | null;
  label?: string;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface ComboIssue {
  code: 'CONTRADICTORY' | 'SAME_FIXTURE_CORRELATION' | 'STARTED' | 'STALE_ODDS' | 'MISSING_PROBABILITY' | 'DUPLICATE';
  severity: 'block' | 'warn';
  legIds: string[];
  message: string;
}

export interface ComboAnalysis {
  legs: number;
  combinedOdds: number;
  naiveProbability: number | null;
  adjustedProbability: number | null;
  correlationPenalty: number;
  probabilityIsApproximate: boolean;
  expectedValue: number | null;
  riskLevel: RiskLevel;
  issues: ComboIssue[];
  blocked: boolean;
  /** Contribución de cada selección al riesgo total (−ln p normalizado). */
  legImpact: Array<{ legId: string; probability: number | null; riskShare: number | null }>;
}

export interface ComboOptions {
  now?: Date;
  staleOddsSeconds?: number;
  /** Matrices de marcadores por partido para calcular probabilidades conjuntas exactas del mismo partido. */
  scoreMatrices?: Record<string, ScoreMatrix>;
  /** Penalización por cada par de selecciones correlacionadas del mismo partido sin modelo conjunto. */
  pairPenalty?: number;
  maxPenalty?: number;
}

const DEFAULT_OPTIONS = { staleOddsSeconds: 2 * 60 * 60, pairPenalty: 0.1, maxPenalty: 0.3 };

/** Dos selecciones del mismo partido que no pueden ganar a la vez, con reglas explícitas. */
export function areContradictory(a: ComboLeg, b: ComboLeg): boolean {
  if (a.fixtureId !== b.fixtureId) return false;
  // Si ambas se pueden evaluar sobre marcadores, se comprueba exhaustivamente que no exista ninguno donde ambas ganen.
  if (isGoalMatrixMarket(a.marketKey) && isGoalMatrixMarket(b.marketKey)) {
    for (let h = 0; h <= 12; h++) {
      for (let w = 0; w <= 12; w++) {
        const result = { status: 'FINISHED' as const, homeScore: h, awayScore: w };
        if (winWeight(settleSelection(a, result)) > 0 && winWeight(settleSelection(b, result)) > 0) return false;
      }
    }
    return true;
  }
  if (a.marketKey === b.marketKey && (a.line ?? null) === (b.line ?? null) && a.selectionKey !== b.selectionKey) return true;
  if (a.marketKey === b.marketKey && ['OU_CORNERS', 'OU_CARDS', 'OU_POINTS'].includes(a.marketKey)) {
    const over = a.selectionKey === 'OVER' ? a : b.selectionKey === 'OVER' ? b : null;
    const under = a.selectionKey === 'UNDER' ? a : b.selectionKey === 'UNDER' ? b : null;
    if (over && under && over.line != null && under.line != null) return Math.floor(over.line) + 1 >= under.line;
  }
  return false;
}

/** Probabilidad conjunta exacta de varias selecciones del mismo partido sobre la matriz de marcadores. */
export function jointProbabilityFromMatrix(matrix: ScoreMatrix, legs: ComboLeg[]): number {
  let p = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      const result = { status: 'FINISHED' as const, homeScore: i, awayScore: j };
      let weight = 1;
      for (const leg of legs) {
        weight *= winWeight(settleSelection(leg, result));
        if (weight === 0) break;
      }
      p += matrix[i][j] * weight;
    }
  }
  return p;
}

export function riskLevelFor(probability: number | null, legs: number): RiskLevel {
  if (probability == null) return legs <= 2 ? 'HIGH' : 'VERY_HIGH';
  if (probability >= 0.5) return 'LOW';
  if (probability >= 0.25) return 'MEDIUM';
  if (probability >= 0.1) return 'HIGH';
  return 'VERY_HIGH';
}

/**
 * Analiza una combinada: cuota total, probabilidad ingenua (independencia),
 * probabilidad ajustada (modelo conjunto del mismo partido o penalización
 * visible), EV, riesgo y problemas que bloquean o advierten.
 */
export function analyzeCombination(legs: ComboLeg[], options: ComboOptions = {}): ComboAnalysis {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = opts.now ?? new Date();
  const issues: ComboIssue[] = [];

  const seen = new Map<string, string>();
  for (const leg of legs) {
    const key = `${leg.fixtureId}|${leg.marketKey}|${leg.selectionKey}|${leg.line ?? ''}`;
    if (seen.has(key)) issues.push({ code: 'DUPLICATE', severity: 'block', legIds: [seen.get(key)!, leg.id], message: 'Selección repetida' });
    else seen.set(key, leg.id);
    if (leg.kickoff && leg.kickoff.getTime() <= now.getTime()) {
      issues.push({ code: 'STARTED', severity: 'block', legIds: [leg.id], message: `${leg.label ?? leg.id}: el partido ya comenzó` });
    }
    if (leg.oddsCapturedAt && (now.getTime() - leg.oddsCapturedAt.getTime()) / 1000 > opts.staleOddsSeconds) {
      issues.push({ code: 'STALE_ODDS', severity: 'warn', legIds: [leg.id], message: `${leg.label ?? leg.id}: cuota desactualizada, actualízala antes de compartir` });
    }
    if (leg.probability == null) {
      issues.push({ code: 'MISSING_PROBABILITY', severity: 'warn', legIds: [leg.id], message: `${leg.label ?? leg.id}: sin probabilidad del modelo; EV no calculable` });
    }
  }

  const byFixture = new Map<string, ComboLeg[]>();
  for (const leg of legs) byFixture.set(leg.fixtureId, [...(byFixture.get(leg.fixtureId) ?? []), leg]);

  let correlatedPairs = 0;
  let approximate = legs.length > 1;
  let adjusted: number | null = 1;
  for (const [fixtureId, group] of byFixture) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (areContradictory(group[i], group[j])) {
          issues.push({ code: 'CONTRADICTORY', severity: 'block', legIds: [group[i].id, group[j].id], message: 'Selecciones incompatibles: no pueden ganar a la vez' });
        }
      }
    }
    if (group.length === 1) {
      adjusted = adjusted == null || group[0].probability == null ? null : adjusted * group[0].probability;
      continue;
    }
    const matrix = opts.scoreMatrices?.[fixtureId];
    if (matrix && group.every((l) => isGoalMatrixMarket(l.marketKey))) {
      adjusted = adjusted == null ? null : adjusted * jointProbabilityFromMatrix(matrix, group);
      issues.push({ code: 'SAME_FIXTURE_CORRELATION', severity: 'warn', legIds: group.map((l) => l.id), message: 'Selecciones del mismo partido: probabilidad conjunta calculada con el modelo de marcadores' });
    } else {
      const pairs = (group.length * (group.length - 1)) / 2;
      correlatedPairs += pairs;
      const product = group.reduce<number | null>((acc, l) => (acc == null || l.probability == null ? null : acc * l.probability), 1);
      adjusted = adjusted == null || product == null ? null : adjusted * product;
      issues.push({ code: 'SAME_FIXTURE_CORRELATION', severity: 'warn', legIds: group.map((l) => l.id), message: 'Selecciones correlacionadas del mismo partido sin modelo conjunto: se aplica penalización' });
    }
  }
  if (legs.length <= 1) approximate = false;

  const correlationPenalty = Math.min(opts.maxPenalty, correlatedPairs * opts.pairPenalty);
  if (adjusted != null) adjusted *= 1 - correlationPenalty;

  const naive = legs.every((l) => l.probability != null) ? legs.reduce((acc, l) => acc * (l.probability as number), 1) : null;
  const combinedOdds = legs.reduce((acc, l) => acc * l.odds, 1);
  const blocked = issues.some((i) => i.severity === 'block');
  const totalRisk = legs.reduce((s, l) => s + (l.probability ? -Math.log(l.probability) : 0), 0);

  return {
    legs: legs.length,
    combinedOdds: Math.round(combinedOdds * 100) / 100,
    naiveProbability: naive,
    adjustedProbability: blocked ? 0 : adjusted,
    correlationPenalty,
    probabilityIsApproximate: approximate,
    expectedValue: adjusted != null && !blocked ? adjusted * combinedOdds - 1 : null,
    riskLevel: riskLevelFor(blocked ? 0 : adjusted, legs.length),
    issues,
    blocked,
    legImpact: legs.map((l) => ({
      legId: l.id,
      probability: l.probability ?? null,
      riskShare: l.probability && totalRisk > 0 ? -Math.log(l.probability) / totalRisk : null,
    })),
  };
}

function* kCombinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i < items.length; i++) yield* kCombinations(items, k, i + 1, [...acc, items[i]]);
}

export interface SystemAnalysis {
  name: string;
  size: number;
  combinations: number;
  stakePerCombination: number;
  totalStake: number;
  maxReturn: number;
  /** Retorno esperado simulado asumiendo independencia entre partidos. */
  expectedReturn: number | null;
  /** P(al menos una combinación ganadora) = P(≥ size aciertos). */
  probabilityAnyReturn: number | null;
}

/** P(exactamente k aciertos) para eventos independientes (Poisson-binomial). */
export function poissonBinomial(probabilities: number[]): number[] {
  let dist = [1];
  for (const p of probabilities) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist;
}

/** Sistema k/n (p. ej. 2/3, 3/4): todas las combinadas de tamaño k con stake repartido. Simulación en unidades. */
export function analyzeSystem(legs: ComboLeg[], size: number, totalStake = 1): SystemAnalysis {
  if (size < 1 || size > legs.length) throw new RangeError('Tamaño de sistema inválido');
  const combos = [...kCombinations(legs, size)];
  const stake = totalStake / combos.length;
  const allKnown = legs.every((l) => l.probability != null);
  let expected = 0;
  let maxReturn = 0;
  for (const combo of combos) {
    const odds = combo.reduce((a, l) => a * l.odds, 1);
    maxReturn += stake * odds;
    if (allKnown) expected += stake * odds * combo.reduce((a, l) => a * (l.probability as number), 1);
  }
  const dist = allKnown ? poissonBinomial(legs.map((l) => l.probability as number)) : null;
  return {
    name: `${size}/${legs.length}`,
    size,
    combinations: combos.length,
    stakePerCombination: stake,
    totalStake,
    maxReturn,
    expectedReturn: allKnown ? expected : null,
    probabilityAnyReturn: dist ? dist.slice(size).reduce((s, p) => s + p, 0) : null,
  };
}
