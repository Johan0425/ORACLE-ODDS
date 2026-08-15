import { describe, expect, it } from 'vitest';
import { estimateExpectedCards, estimateExpectedCorners } from '../src/models/expected-count';
import { calculateCardsOverUnder, calculateCornersOverUnder } from '../src/markets/corners-cards';
import { computeFixtureProbabilities } from '../src/index';
import type { LeagueGoalContext, TeamRecentData } from '../src/types';

const league: LeagueGoalContext = { avgHomeGoalsScored: 1.5, avgAwayGoalsScored: 1.1 };

const homeWithCounts: TeamRecentData = {
  teamId: 'home',
  teamName: 'Local FC',
  recentMatches: [
    { goalsFor: 2, goalsAgainst: 1, corners: 7, cards: 2 },
    { goalsFor: 1, goalsAgainst: 1, corners: 6, cards: 3 },
    { goalsFor: 2, goalsAgainst: 0, corners: 8, cards: 1 },
  ],
};

const awayWithCounts: TeamRecentData = {
  teamId: 'away',
  teamName: 'Visitante FC',
  recentMatches: [
    { goalsFor: 1, goalsAgainst: 2, corners: 4, cards: 2 },
    { goalsFor: 0, goalsAgainst: 1, corners: 5, cards: 3 },
    { goalsFor: 1, goalsAgainst: 2, corners: 4, cards: 2 },
  ],
};

const teamWithoutCounts: TeamRecentData = {
  teamId: 'no-data',
  teamName: 'Sin Datos FC',
  recentMatches: [{ goalsFor: 1, goalsAgainst: 1 }],
};

describe('estimación de córners/tarjetas', () => {
  it('devuelve null si algún equipo no trae el dato en su historial', () => {
    expect(estimateExpectedCorners(homeWithCounts, teamWithoutCounts)).toBeNull();
    expect(estimateExpectedCards(homeWithCounts, teamWithoutCounts)).toBeNull();
  });

  it('estima valores positivos cuando ambos equipos traen el dato', () => {
    const corners = estimateExpectedCorners(homeWithCounts, awayWithCounts);
    expect(corners).not.toBeNull();
    expect(corners!.home).toBeGreaterThan(0);
    expect(corners!.away).toBeGreaterThan(0);
  });
});

describe('over/under de córners y tarjetas', () => {
  it('over y under de córners son complementarios', () => {
    const expected = estimateExpectedCorners(homeWithCounts, awayWithCounts)!;
    const result = calculateCornersOverUnder(expected, 9.5);
    expect(result.over + result.under).toBeCloseTo(1, 6);
  });

  it('over y under de tarjetas son complementarios', () => {
    const expected = estimateExpectedCards(homeWithCounts, awayWithCounts)!;
    const result = calculateCardsOverUnder(expected, 3.5);
    expect(result.over + result.under).toBeCloseTo(1, 6);
  });
});

describe('computeFixtureProbabilities con córners/tarjetas', () => {
  it('incluye OVER_UNDER_CORNERS y OVER_UNDER_CARDS cuando hay datos', () => {
    const results = computeFixtureProbabilities({
      home: homeWithCounts,
      away: awayWithCounts,
      h2h: [],
      league,
    });

    expect(results.some((r) => r.market === 'OVER_UNDER_CORNERS')).toBe(true);
    expect(results.some((r) => r.market === 'OVER_UNDER_CARDS')).toBe(true);
  });

  it('omite esos mercados (sin inventar números) cuando el historial no trae el dato', () => {
    const results = computeFixtureProbabilities({
      home: teamWithoutCounts,
      away: teamWithoutCounts,
      h2h: [],
      league,
    });

    expect(results.some((r) => r.market === 'OVER_UNDER_CORNERS')).toBe(false);
    expect(results.some((r) => r.market === 'OVER_UNDER_CARDS')).toBe(false);
    // 1X2 y over/under de goles sí deben seguir calculándose.
    expect(results.some((r) => r.market === 'MONEYLINE_1X2')).toBe(true);
  });
});
