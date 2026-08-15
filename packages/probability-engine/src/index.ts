import { estimateExpectedGoals } from './models/expected-goals';
import { estimateExpectedCards, estimateExpectedCorners } from './models/expected-count';
import { weightedAverage } from './models/weighted-form';
import { DEFAULT_HOME_ADVANTAGE } from './models/home-advantage';
import { calculateMoneyline } from './markets/moneyline';
import { calculateOverUnder } from './markets/over-under';
import { calculateAsianHandicap } from './markets/asian-handicap';
import { calculateCardsOverUnder, calculateCornersOverUnder } from './markets/corners-cards';
import { assessConfidence, type ConfidenceLevel } from './explainability/confidence';
import { explainHandicap, explainMoneyline, explainOverUnder } from './explainability/explain';
import type { ExpectedCount, FixtureProbabilityInput, H2HMatchSample, TeamRecentData } from './types';

export * from './types';
export * from './models/poisson';
export * from './models/weighted-form';
export * from './models/home-advantage';
export * from './models/goal-matrix';
export * from './models/expected-goals';
export * from './models/expected-count';
export * from './markets/moneyline';
export * from './markets/over-under';
export * from './markets/asian-handicap';
export * from './markets/corners-cards';
export * from './explainability/confidence';
export * from './explainability/explain';
export * from './edge-detector';

export type Market = 'MONEYLINE_1X2' | 'OVER_UNDER_GOALS' | 'ASIAN_HANDICAP' | 'OVER_UNDER_CORNERS' | 'OVER_UNDER_CARDS';

export interface CalculatedMarketProbability {
  market: Market;
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
 * probabilidad + justificación en lenguaje natural + nivel de confianza para 1X2,
 * over/under de goles, hándicap asiático, y — cuando el historial trae esos datos —
 * over/under de córners y de tarjetas. Es lo que el módulo `probabilities` de la
 * API llama para poblar `CalculatedProbability`.
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

  const homeGoalAvg = teamGoalAverages(input.home);
  const awayGoalAvg = teamGoalAverages(input.away);
  const teamNames = { homeTeamName: input.home.teamName, awayTeamName: input.away.teamName };

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
      explanation: explainMoneyline({
        ...teamNames,
        homeAvgGoalsScored: homeGoalAvg.scored,
        awayAvgGoalsScored: awayGoalAvg.scored,
        homeAvgGoalsConceded: homeGoalAvg.conceded,
        awayAvgGoalsConceded: awayGoalAvg.conceded,
        selection,
        probability,
      }),
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
        explanation: explainOverUnder({
          ...teamNames,
          selection,
          line,
          probability,
          statLabel: 'goles',
          homeAvg: homeGoalAvg.scored,
          awayAvg: awayGoalAvg.scored,
          h2hOverRate,
        }),
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
        explanation: explainHandicap({ ...teamNames, selection, line, probability }),
      });
    });
  }

  pushCountMarket(results, {
    market: 'OVER_UNDER_CORNERS',
    statLabel: 'córners',
    lines: input.cornersLines ?? [9.5],
    expected: estimateExpectedCorners(input.home, input.away),
    calculate: calculateCornersOverUnder,
    confidence,
    teamNames,
  });

  pushCountMarket(results, {
    market: 'OVER_UNDER_CARDS',
    statLabel: 'tarjetas',
    lines: input.cardsLines ?? [3.5],
    expected: estimateExpectedCards(input.home, input.away),
    calculate: calculateCardsOverUnder,
    confidence,
    teamNames,
  });

  return results;
}

function pushCountMarket(
  results: CalculatedMarketProbability[],
  options: {
    market: Market;
    statLabel: string;
    lines: number[];
    expected: ExpectedCount | null;
    calculate: (expected: ExpectedCount, line: number) => { over: number; under: number };
    confidence: ConfidenceLevel;
    teamNames: { homeTeamName: string; awayTeamName: string };
  },
): void {
  // Sin historial de córners/tarjetas (proveedor o seed que no trae ese dato), el
  // mercado no aparece en vez de mostrar un número inventado.
  if (!options.expected) return;

  for (const line of options.lines) {
    const result = options.calculate(options.expected, line);
    (['over', 'under'] as const).forEach((selection) => {
      const probability = result[selection];
      results.push({
        market: options.market,
        selection,
        line,
        probability,
        confidence: options.confidence,
        explanation: explainOverUnder({
          ...options.teamNames,
          selection,
          line,
          probability,
          statLabel: options.statLabel,
          homeAvg: options.expected!.home,
          awayAvg: options.expected!.away,
        }),
      });
    });
  }
}
