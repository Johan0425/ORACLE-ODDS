import { describe, expect, it } from 'vitest';
import { estimateExpectedGoals } from '../src/models/expected-goals';
import { calculateMoneyline } from '../src/markets/moneyline';
import { calculateOverUnder } from '../src/markets/over-under';
import { calculateAsianHandicap } from '../src/markets/asian-handicap';
import type { LeagueGoalContext, TeamRecentData } from '../src/types';

const league: LeagueGoalContext = { avgHomeGoalsScored: 1.5, avgAwayGoalsScored: 1.1 };

const strongHome: TeamRecentData = {
  teamId: 'home',
  teamName: 'Local FC',
  recentMatches: [
    { goalsFor: 3, goalsAgainst: 0 },
    { goalsFor: 2, goalsAgainst: 1 },
    { goalsFor: 2, goalsAgainst: 0 },
    { goalsFor: 1, goalsAgainst: 1 },
    { goalsFor: 3, goalsAgainst: 1 },
  ],
};

const weakAway: TeamRecentData = {
  teamId: 'away',
  teamName: 'Visitante FC',
  recentMatches: [
    { goalsFor: 0, goalsAgainst: 2 },
    { goalsFor: 1, goalsAgainst: 2 },
    { goalsFor: 0, goalsAgainst: 1 },
    { goalsFor: 1, goalsAgainst: 3 },
    { goalsFor: 0, goalsAgainst: 2 },
  ],
};

describe('moneyline (1X2)', () => {
  it('las tres probabilidades suman ~1', () => {
    const xg = estimateExpectedGoals(strongHome, weakAway, league);
    const result = calculateMoneyline(xg);
    expect(result.homeWin + result.draw + result.awayWin).toBeCloseTo(1, 6);
  });

  it('favorece claramente al local ante un rival muy inferior', () => {
    const xg = estimateExpectedGoals(strongHome, weakAway, league);
    const result = calculateMoneyline(xg);
    expect(result.homeWin).toBeGreaterThan(result.awayWin);
    expect(result.homeWin).toBeGreaterThan(0.5);
  });
});

describe('over/under de goles', () => {
  it('over y under son complementarios', () => {
    const xg = estimateExpectedGoals(strongHome, weakAway, league);
    const result = calculateOverUnder(xg, 2.5);
    expect(result.over + result.under).toBeCloseTo(1, 6);
  });

  it('una línea entera reparte probabilidad entre over, under y push', () => {
    const xg = estimateExpectedGoals(strongHome, weakAway, league);
    const result = calculateOverUnder(xg, 2);
    expect(result.over + result.under + result.push).toBeCloseTo(1, 6);
    expect(result.push).toBeGreaterThan(0);
  });
});

describe('hándicap asiático', () => {
  it('homeCovers + push + awayCovers suma 1', () => {
    const xg = estimateExpectedGoals(strongHome, weakAway, league);
    const result = calculateAsianHandicap(xg, -1);
    expect(result.homeCovers + result.push + result.awayCovers).toBeCloseTo(1, 6);
  });

  it('una línea de cuarto promedia las dos líneas medias adyacentes', () => {
    const xg = estimateExpectedGoals(strongHome, weakAway, league);
    const quarter = calculateAsianHandicap(xg, -0.75);
    const halfA = calculateAsianHandicap(xg, -0.5);
    const halfB = calculateAsianHandicap(xg, -1);
    expect(quarter.homeCovers).toBeCloseTo((halfA.homeCovers + halfB.homeCovers) / 2, 6);
  });
});
