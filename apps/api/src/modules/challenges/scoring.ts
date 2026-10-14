import { profitUnits, type SettlementOutcome } from '@oracle-odds/probability-engine';

export const SCORING_SYSTEMS = ['simple', 'weighted', 'virtual_units', 'survivor', 'elimination', 'quiniela'] as const;
export type ScoringSystem = (typeof SCORING_SYSTEMS)[number];
export const CHALLENGE_FORMATS = ['one_off', 'weekly', 'private_league'] as const;
export type ChallengeFormat = (typeof CHALLENGE_FORMATS)[number];

export interface ScoringRules {
  system: ScoringSystem;
  format: ChallengeFormat;
  allowedMarkets: string[];
}

export interface ScoredPick {
  fixtureId: string;
  kickoff: Date;
  outcome: SettlementOutcome | null;
  /** Cuota de referencia capturada al elegir (mejor precio autorizado o cuota justa del modelo). */
  referenceOdds: number | null;
}

export interface EntryScore {
  score: number;
  tiebreaker: number;
  eliminated: boolean;
  settled: number;
  correct: number;
}

/**
 * Puntuación sin dinero real:
 * - simple / quiniela: 1 punto por acierto.
 * - weighted: aciertos ponderados por dificultad (cuota de referencia, tope 10).
 * - virtual_units: beneficio en unidades virtuales a 1 u por pick.
 * - survivor: aciertos consecutivos hasta el primer fallo (eliminado).
 * - elimination: como survivor, con dos vidas.
 * Desempate: aciertos totales y luego cuota media acertada.
 */
export function scoreEntry(system: ScoringSystem, picks: ScoredPick[]): EntryScore {
  const ordered = [...picks].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  let score = 0;
  let correct = 0;
  let settled = 0;
  let losses = 0;
  let eliminated = false;
  let oddsSum = 0;
  const lives = system === 'elimination' ? 2 : system === 'survivor' ? 1 : Infinity;
  for (const p of ordered) {
    if (p.outcome == null || p.outcome === 'VOID' || eliminated) continue;
    settled += 1;
    const won = p.outcome === 'WIN' || p.outcome === 'HALF_WIN';
    if (won) {
      correct += 1;
      oddsSum += p.referenceOdds ?? 0;
    }
    switch (system) {
      case 'simple':
      case 'quiniela':
        score += won ? 1 : 0;
        break;
      case 'weighted':
        score += won ? Math.min(10, p.referenceOdds ?? 1) * (p.outcome === 'HALF_WIN' ? 0.5 : 1) : 0;
        break;
      case 'virtual_units':
        score += p.referenceOdds ? profitUnits(p.outcome, 1, p.referenceOdds) : 0;
        break;
      case 'survivor':
      case 'elimination':
        if (won) score += 1;
        else if (p.outcome !== 'PUSH') {
          losses += 1;
          if (losses >= lives) eliminated = true;
        }
        break;
    }
  }
  return {
    score: Math.round(score * 100) / 100,
    tiebreaker: Math.round((correct * 1000 + (correct ? oddsSum / correct : 0)) * 100) / 100,
    eliminated,
    settled,
    correct,
  };
}
