import { settleSelection, type SelectionRef, type SettlementOutcome } from '../settlement/settle';
import type { ScoreMatrix } from '../models/dixon-coles';
import { poissonPmf } from '../models/poisson';

export interface OutcomeDistribution {
  win: number;
  halfWin: number;
  push: number;
  halfLoss: number;
  loss: number;
}

const GOAL_MARKETS = new Set(['1X2', 'DC', 'DNB', 'OU_GOALS', 'BTTS', 'AH', 'EH', 'CS']);

export function isGoalMatrixMarket(marketKey: string): boolean {
  return GOAL_MARKETS.has(marketKey);
}

function addOutcome(dist: OutcomeDistribution, outcome: SettlementOutcome, p: number): void {
  switch (outcome) {
    case 'WIN':
      dist.win += p;
      break;
    case 'HALF_WIN':
      dist.halfWin += p;
      break;
    case 'PUSH':
    case 'VOID':
      dist.push += p;
      break;
    case 'HALF_LOSS':
      dist.halfLoss += p;
      break;
    case 'LOSS':
      dist.loss += p;
      break;
  }
}

/**
 * Distribución de liquidación de una selección sobre la matriz de marcadores.
 * Usa exactamente las mismas reglas que la liquidación real, así el precio y la
 * liquidación no pueden divergir.
 */
export function selectionDistributionFromMatrix(matrix: ScoreMatrix, sel: SelectionRef): OutcomeDistribution {
  if (!isGoalMatrixMarket(sel.marketKey)) throw new Error(`Mercado ${sel.marketKey} no derivable de la matriz de goles`);
  const dist: OutcomeDistribution = { win: 0, halfWin: 0, push: 0, halfLoss: 0, loss: 0 };
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      addOutcome(dist, settleSelection(sel, { status: 'FINISHED', homeScore: i, awayScore: j }), matrix[i][j]);
    }
  }
  return dist;
}

/** Distribución para un total Poisson (córners, tarjetas) — independiente de la matriz de goles. */
export function totalsDistribution(lambdaTotal: number, line: number, selection: 'OVER' | 'UNDER', maxCount = 40): OutcomeDistribution {
  const dist: OutcomeDistribution = { win: 0, halfWin: 0, push: 0, halfLoss: 0, loss: 0 };
  let mass = 0;
  for (let k = 0; k <= maxCount; k++) {
    const p = poissonPmf(k, lambdaTotal);
    mass += p;
    addOutcome(dist, settleSelection({ marketKey: 'OU_GOALS', selectionKey: selection, line }, { status: 'FINISHED', homeScore: k, awayScore: 0 }), p);
  }
  // La masa por encima de maxCount es despreciable pero se asigna para que la distribución sume 1.
  addOutcome(dist, selection === 'OVER' ? 'WIN' : 'LOSS', Math.max(0, 1 - mass));
  return dist;
}

/** Cuota justa para una distribución con push/medias: la que hace EV = 0. */
export function fairOddsFromDistribution(d: OutcomeDistribution): number {
  const winning = d.win + d.halfWin / 2;
  const losing = d.loss + d.halfLoss / 2;
  if (winning <= 0) return Infinity;
  return 1 + losing / winning;
}

/**
 * Probabilidad "efectiva" (1 / cuota justa). Coincide con P(ganar) en mercados
 * sin push y es comparable con la probabilidad sin vig del mercado en líneas
 * enteras o de cuarto.
 */
export function effectiveProbability(d: OutcomeDistribution): number {
  const odds = fairOddsFromDistribution(d);
  return Number.isFinite(odds) ? 1 / odds : 0;
}

/** EV por unidad a una cuota, considerando push y medias. */
export function expectedValueFromDistribution(d: OutcomeDistribution, decimalOdds: number): number {
  return (d.win + d.halfWin / 2) * (decimalOdds - 1) - (d.loss + d.halfLoss / 2);
}
