import { kellyFraction } from '../odds/value';
import { seededRandom } from '../evaluation/metrics';

/**
 * Calculadora educativa de gestión de bankroll. Solo simula: no recomienda
 * montos monetarios y no implementa martingalas ni recuperación de pérdidas.
 */

export type StakingMethod = 'flat' | 'units' | 'fractional_kelly';

export interface StakingConfig {
  method: StakingMethod;
  bankrollUnits: number;
  /** Unidades fijas por selección (flat/units). */
  unitsPerBet: number;
  kellyFraction: number;
  maxUnitsPerBet: number;
  dailyLimitUnits: number;
  weeklyLimitUnits: number;
}

export const DEFAULT_STAKING: StakingConfig = {
  method: 'fractional_kelly',
  bankrollUnits: 100,
  unitsPerBet: 1,
  kellyFraction: 0.25,
  maxUnitsPerBet: 2,
  dailyLimitUnits: 5,
  weeklyLimitUnits: 15,
};

export const BANKROLL_WARNING =
  'Simulación educativa. Las apuestas tienen varianza alta y puedes perder la totalidad del stake. ' +
  'No persigas pérdidas ni aumentes el stake para recuperarlas.';

export interface StakeSuggestion {
  units: number;
  reason: string;
  cappedBy: 'none' | 'max_per_bet' | 'daily_limit' | 'weekly_limit' | 'no_edge';
}

export function suggestStake(
  probability: number,
  odds: number,
  config: Partial<StakingConfig> = {},
  usage: { dailyUnits?: number; weeklyUnits?: number } = {},
): StakeSuggestion {
  const c = { ...DEFAULT_STAKING, ...config, kellyFraction: Math.min(config.kellyFraction ?? DEFAULT_STAKING.kellyFraction, 1) };
  let units: number;
  let cappedBy: StakeSuggestion['cappedBy'] = 'none';
  if (c.method === 'fractional_kelly') {
    const f = kellyFraction(probability, odds);
    if (f <= 0) return { units: 0, reason: 'Sin valor esperado positivo: Kelly sugiere no apostar', cappedBy: 'no_edge' };
    units = f * c.kellyFraction * c.bankrollUnits;
  } else {
    units = c.unitsPerBet;
  }
  if (units > c.maxUnitsPerBet) {
    units = c.maxUnitsPerBet;
    cappedBy = 'max_per_bet';
  }
  const dailyLeft = Math.max(0, c.dailyLimitUnits - (usage.dailyUnits ?? 0));
  const weeklyLeft = Math.max(0, c.weeklyLimitUnits - (usage.weeklyUnits ?? 0));
  if (units > dailyLeft) {
    units = dailyLeft;
    cappedBy = 'daily_limit';
  }
  if (units > weeklyLeft) {
    units = weeklyLeft;
    cappedBy = 'weekly_limit';
  }
  units = Math.floor(units * 4) / 4;
  const reasons: Record<StakeSuggestion['cappedBy'], string> = {
    none: 'Dentro de los límites configurados',
    max_per_bet: `Limitado al máximo de ${c.maxUnitsPerBet} unidades por selección`,
    daily_limit: 'Limitado por el tope diario',
    weekly_limit: 'Limitado por el tope semanal',
    no_edge: '',
  };
  return { units, reason: reasons[cappedBy], cappedBy };
}

export interface SimulationResult {
  runs: number;
  bets: number;
  medianFinal: number;
  p5Final: number;
  p95Final: number;
  probabilityOfLoss: number;
  probabilityOfHalvingBankroll: number;
  averageMaxDrawdown: number;
}

/** Monte Carlo de una secuencia de apuestas iguales (probabilidad/cuota) con el staking elegido. */
export function simulateBankroll(
  bet: { probability: number; odds: number },
  bets: number,
  config: Partial<StakingConfig> = {},
  runs = 2000,
  seed = 7,
): SimulationResult {
  const c = { ...DEFAULT_STAKING, ...config };
  const rand = seededRandom(seed);
  const finals: number[] = [];
  let halved = 0;
  let ddSum = 0;
  for (let r = 0; r < runs; r++) {
    let bank = c.bankrollUnits;
    let peak = bank;
    let maxDd = 0;
    for (let i = 0; i < bets && bank > 0; i++) {
      let stake: number;
      if (c.method === 'fractional_kelly') {
        const f = Math.max(0, kellyFraction(bet.probability, bet.odds));
        stake = Math.min(f * c.kellyFraction * bank, c.maxUnitsPerBet);
      } else {
        stake = Math.min(c.unitsPerBet, c.maxUnitsPerBet);
      }
      stake = Math.min(stake, bank);
      bank += rand() < bet.probability ? stake * (bet.odds - 1) : -stake;
      peak = Math.max(peak, bank);
      maxDd = Math.max(maxDd, (peak - bank) / peak);
    }
    finals.push(bank);
    if (bank <= c.bankrollUnits / 2) halved += 1;
    ddSum += maxDd;
  }
  finals.sort((a, b) => a - b);
  const q = (x: number) => finals[Math.min(finals.length - 1, Math.floor(x * finals.length))];
  return {
    runs,
    bets,
    medianFinal: q(0.5),
    p5Final: q(0.05),
    p95Final: q(0.95),
    probabilityOfLoss: finals.filter((f) => f < c.bankrollUnits).length / runs,
    probabilityOfHalvingBankroll: halved / runs,
    averageMaxDrawdown: ddSum / runs,
  };
}
