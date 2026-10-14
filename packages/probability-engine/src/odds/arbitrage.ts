import { assertValidDecimalOdds } from './conversion';

export interface ArbitrageLeg {
  selection: string;
  bookmaker: string;
  price: number;
  capturedAt?: Date;
}

export interface ArbitrageResult {
  /** Σ 1/cuota con la mejor cuota de cada selección. < 1 indica arbitraje matemático. */
  impliedSum: number;
  isArbitrage: boolean;
  /** Retorno teórico sobre el stake total si todas las cuotas se mantienen: 1/impliedSum − 1. */
  theoreticalMargin: number;
  /** Reparto teórico del stake total para igualar el retorno de todas las selecciones. */
  stakes: Array<ArbitrageLeg & { stake: number; theoreticalReturn: number }>;
  warning: string;
}

export const ARBITRAGE_WARNING =
  'Cálculo teórico: las cuotas pueden cambiar o ser limitadas antes de colocarse y la oportunidad puede desaparecer. ' +
  'Verifica cada cuota directamente con el operador. ORACLE ODDS no ejecuta apuestas.';

/**
 * Detector de arbitraje matemático sobre un libro completo (una selección por
 * resultado posible). No asegura nada: solo describe una relación aritmética
 * entre cuotas en un instante.
 */
export function detectArbitrage(legs: ArbitrageLeg[], totalStake = 100): ArbitrageResult {
  if (legs.length < 2) throw new RangeError('El arbitraje requiere al menos dos selecciones');
  legs.forEach((l) => assertValidDecimalOdds(l.price));
  const impliedSum = legs.reduce((s, l) => s + 1 / l.price, 0);
  const stakes = legs.map((l) => {
    const stake = (totalStake * (1 / l.price)) / impliedSum;
    return { ...l, stake: Math.round(stake * 100) / 100, theoreticalReturn: Math.round(stake * l.price * 100) / 100 };
  });
  return {
    impliedSum,
    isArbitrage: impliedSum < 1,
    theoreticalMargin: 1 / impliedSum - 1,
    stakes,
    warning: ARBITRAGE_WARNING,
  };
}
