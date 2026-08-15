import { estimateExpectedGoals } from './models/expected-goals';
import { weightedAverage } from './models/weighted-form';
import { DEFAULT_HOME_ADVANTAGE } from './models/home-advantage';
import { calculateMoneyline } from './markets/moneyline';
import { calculateOverUnder } from './markets/over-under';
import { calculateAsianHandicap } from './markets/asian-handicap';
import { assessConfidence, type ConfidenceLevel } from './explainability/confidence';
import { explainHandicap, explainMoneyline, explainOverUnder } from './explainability/explain';
import type { FixtureProbabilityInput, H2HMatchSample, TeamRecentData } from './types';

export * from './types';
export * from './models/poisson';
export * from './models/weighted-form';
export * from './models/home-advantage';
export * from './models/goal-matrix';
export * from './models/expected-goals';
export * from './markets/moneyline';
export * from './markets/over-under';
export * from './markets/asian-handicap';
export * from './explainability/confidence';
export * from './explainability/explain';
export * from './edge-detector';

export interface CalculatedMarketProbability {
  market: 'MONEYLINE_1X2' | 'OVER_UNDER_GOALS' | 'ASIAN_HANDICAP';
  selection: string;
  line: number | null;
  probability: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

function teamGoalAverages(team: TeamRecentData) {
  return {
    scored: weightedAverage(team.recentMatches.map((m) => m.goalsFor)),
    conceded: weightedAverage(team.recentMatches.map((m) => m.goalsAgainst)),
  };
}

function summarizeH2HOverRate(h2h: H2HMatchSample[], line: number) {
  if (h2h.length === 0) return undefined;
  return { overCount: h2h.filter((m) => m.totalGoals > line).length, totalMatches: h2h.length, line };
}

/**
 * Punto de entrada del paquete: dado el histórico reciente de ambos equipos, calcula
 * probabilidad + justificación en lenguaje natural + nivel de confianza para los
 * mercados 1X2, over/under de goles y hándicap asiático. Es lo que el módulo
 * `probabilities` de la API llama para poblar `CalculatedProbability`.
 */
export function computeFixtureProbabilities(input: FixtureProbabilityInput): CalculatedMarketProbability[] {
  const expectedGoals = estimateExpectedGoals(
    input.home,
    input.away,
    input.league,
    input.homeAdvantageFactor ?? DEFAULT_HOME_ADVANTAGE,
  );

  const confidence = assessConfidence({
    homeSampleSize: input.home.recentMatches.length,
    awaySampleSize: input.away.recentMatches.length,
    h2hSampleSize: input.h2h.length,
  });

  const homeAvg = teamGoalAverages(input.home);
  const awayAvg = teamGoalAverages(input.away);
  const explainCtx = {
    homeTeamName: input.home.teamName,
    awayTeamName: input.away.teamName,
    homeAvgGoalsScored: homeAvg.scored,
    awayAvgGoalsScored: awayAvg.scored,
    homeAvgGoalsConceded: homeAvg.conceded,
    awayAvgGoalsConceded: awayAvg.conceded,
  };

  const results: CalculatedMarketProbability[] = [];

  const moneyline = calculateMoneyline(expectedGoals);
  (['home', 'draw', 'away'] as const).forEach((selection) => {
    const probability =
      selection === 'home' ? moneyline.homeWin : selection === 'away' ? moneyline.awayWin : moneyline.draw;
    results.push({
      market: 'MONEYLINE_1X2',
      selection,
      line: null,
      probability,
      confidence,
      explanation: explainMoneyline({ ...explainCtx, selection, probability }),
    });
  });

  for (const line of input.overUnderLines ?? [2.5]) {
    const overUnder = calculateOverUnder(expectedGoals, line);
    const h2hOverRate = summarizeH2HOverRate(input.h2h, line);
    (['over', 'under'] as const).forEach((selection) => {
      const probability = overUnder[selection];
      results.push({
        market: 'OVER_UNDER_GOALS',
        selection,
        line,
        probability,
        confidence,
        explanation: explainOverUnder({ ...explainCtx, selection, line, probability, h2hOverRate }),
      });
    });
  }

  for (const line of input.handicapLines ?? [-0.5]) {
    const handicap = calculateAsianHandicap(expectedGoals, line);
    (['home', 'away'] as const).forEach((selection) => {
      const probability = selection === 'home' ? handicap.homeCovers : handicap.awayCovers;
      results.push({
        market: 'ASIAN_HANDICAP',
        selection,
        line,
        probability,
        confidence,
        explanation: explainHandicap({ ...explainCtx, selection, line, probability }),
      });
    });
  }

  return results;
}
