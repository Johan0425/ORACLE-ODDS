import type { MarketKey } from '../markets/keys';

export type SettlementOutcome = 'WIN' | 'LOSS' | 'PUSH' | 'HALF_WIN' | 'HALF_LOSS' | 'VOID';

export interface SelectionRef {
  marketKey: MarketKey | string;
  selectionKey: string;
  line?: number | null;
}

export interface FinalResult {
  status: 'FINISHED' | 'CANCELLED' | 'POSTPONED' | 'ABANDONED';
  homeScore: number;
  awayScore: number;
  htHomeScore?: number | null;
  htAwayScore?: number | null;
  totalCorners?: number | null;
  totalCards?: number | null;
}

function overUnder(total: number, line: number, selection: string): SettlementOutcome {
  // Líneas de cuarto (2.25, 2.75): mitad del stake en cada línea adyacente.
  if (isQuarter(line)) return combineHalves(overUnder(total, line - 0.25, selection), overUnder(total, line + 0.25, selection));
  if (total === line) return 'PUSH';
  const over = total > line;
  return (selection === 'OVER') === over ? 'WIN' : 'LOSS';
}

function isQuarter(line: number): boolean {
  return Math.abs((line * 4) % 2) === 1;
}

function combineHalves(a: SettlementOutcome, b: SettlementOutcome): SettlementOutcome {
  const pair = [a, b].sort().join('+');
  switch (pair) {
    case 'WIN+WIN':
      return 'WIN';
    case 'LOSS+LOSS':
      return 'LOSS';
    case 'PUSH+WIN':
      return 'HALF_WIN';
    case 'LOSS+PUSH':
      return 'HALF_LOSS';
    case 'PUSH+PUSH':
      return 'PUSH';
    default:
      // WIN+LOSS no ocurre con líneas adyacentes a 0.5 de distancia.
      return 'VOID';
  }
}

function asianHandicap(home: number, away: number, line: number, selection: string): SettlementOutcome {
  if (isQuarter(line)) {
    return combineHalves(asianHandicap(home, away, line - 0.25, selection), asianHandicap(home, away, line + 0.25, selection));
  }
  const diff = home + line - away;
  if (diff === 0) return 'PUSH';
  const homeCovers = diff > 0;
  return (selection === 'HOME') === homeCovers ? 'WIN' : 'LOSS';
}

function threeWay(home: number, away: number, selection: string): SettlementOutcome {
  const result = home > away ? 'HOME' : home === away ? 'DRAW' : 'AWAY';
  return result === selection ? 'WIN' : 'LOSS';
}

/**
 * Liquida una selección contra el resultado oficial. Devuelve VOID si el
 * partido no se completó o si falta el dato necesario (p. ej. córners), en vez
 * de adivinar.
 */
export function settleSelection(sel: SelectionRef, result: FinalResult): SettlementOutcome {
  if (result.status !== 'FINISHED') return 'VOID';
  const { homeScore: h, awayScore: a } = result;
  const line = sel.line ?? 0;

  switch (sel.marketKey) {
    case '1X2':
      return threeWay(h, a, sel.selectionKey);
    case 'ML':
      if (h === a) return 'VOID';
      return threeWay(h, a, sel.selectionKey);
    case 'DC': {
      const r = h > a ? 'HOME' : h === a ? 'DRAW' : 'AWAY';
      return sel.selectionKey.split('_').includes(r) ? 'WIN' : 'LOSS';
    }
    case 'DNB':
      if (h === a) return 'PUSH';
      return threeWay(h, a, sel.selectionKey);
    case 'OU_GOALS':
    case 'OU_POINTS':
      return overUnder(h + a, line, sel.selectionKey);
    case 'BTTS': {
      const both = h > 0 && a > 0;
      return (sel.selectionKey === 'YES') === both ? 'WIN' : 'LOSS';
    }
    case 'AH':
    case 'SPREAD':
      return asianHandicap(h, a, line, sel.selectionKey);
    case 'EH':
      return threeWay(h + line, a, sel.selectionKey);
    case 'CS':
      return sel.selectionKey === `${h}-${a}` ? 'WIN' : 'LOSS';
    case 'OU_CORNERS':
      return result.totalCorners == null ? 'VOID' : overUnder(result.totalCorners, line, sel.selectionKey);
    case 'OU_CARDS':
      return result.totalCards == null ? 'VOID' : overUnder(result.totalCards, line, sel.selectionKey);
    case '1X2_H1':
      if (result.htHomeScore == null || result.htAwayScore == null) return 'VOID';
      return threeWay(result.htHomeScore, result.htAwayScore, sel.selectionKey);
    case 'OU_GOALS_H1':
      if (result.htHomeScore == null || result.htAwayScore == null) return 'VOID';
      return overUnder(result.htHomeScore + result.htAwayScore, line, sel.selectionKey);
    default:
      return 'VOID';
  }
}

/** Ganancia/pérdida neta en unidades para un stake a una cuota decimal. */
export function profitUnits(outcome: SettlementOutcome, stake: number, decimalOdds: number): number {
  switch (outcome) {
    case 'WIN':
      return stake * (decimalOdds - 1);
    case 'HALF_WIN':
      return (stake / 2) * (decimalOdds - 1);
    case 'HALF_LOSS':
      return -stake / 2;
    case 'LOSS':
      return -stake;
    default:
      return 0;
  }
}

/**
 * Fracción "ganadora" usada para probabilidades conjuntas sobre la matriz de
 * marcadores: WIN = 1, HALF_WIN = 0.5, el resto 0.
 */
export function winWeight(outcome: SettlementOutcome): number {
  return outcome === 'WIN' ? 1 : outcome === 'HALF_WIN' ? 0.5 : 0;
}
