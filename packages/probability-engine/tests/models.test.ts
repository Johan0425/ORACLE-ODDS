import { describe, expect, it } from 'vitest';
import {
  buildScoreMatrix,
  computeEloRatings,
  computeTeamStrength,
  dixonColesTau,
  eloExpectedScore,
  eloToOneXTwo,
  estimateRho,
  goalDifferenceMultiplier,
  leagueAverages,
  poissonCdf,
  poissonPmf,
  selectionDistributionFromMatrix,
  effectiveProbability,
  fairOddsFromDistribution,
  sumMatrix,
  totalsDistribution,
  type HistoricalMatch,
} from '../src';

describe('Poisson', () => {
  it('pmf conocida y cdf suma hasta 1', () => {
    expect(poissonPmf(0, 1)).toBeCloseTo(Math.exp(-1), 12);
    expect(poissonPmf(2, 1.5)).toBeCloseTo((Math.exp(-1.5) * 1.5 ** 2) / 2, 12);
    expect(poissonCdf(30, 2.7)).toBeCloseTo(1, 10);
    expect(poissonPmf(-1, 2)).toBe(0);
  });
});

describe('Dixon-Coles', () => {
  it('τ solo afecta marcadores bajos', () => {
    expect(dixonColesTau(2, 3, 1.4, 1.1, -0.1)).toBe(1);
    expect(dixonColesTau(0, 0, 1.4, 1.1, -0.1)).toBeGreaterThan(1);
    expect(dixonColesTau(1, 1, 1.4, 1.1, -0.1)).toBeCloseTo(1.1, 12);
  });

  it('la matriz suma 1 y ρ negativo aumenta los empates bajos', () => {
    const indep = buildScoreMatrix(1.4, 1.1, 0);
    const dc = buildScoreMatrix(1.4, 1.1, -0.1);
    expect(sumMatrix(dc, () => true)).toBeCloseTo(1, 10);
    expect(dc[0][0]).toBeGreaterThan(indep[0][0]);
    expect(dc[1][1]).toBeGreaterThan(indep[1][1]);
    expect(dc[1][0]).toBeLessThan(indep[1][0]);
  });

  it('estimateRho devuelve el default con pocas muestras', () => {
    expect(estimateRho([], 10)).toBe(-0.08);
  });
});

describe('mercados desde la matriz', () => {
  const m = buildScoreMatrix(1.6, 1.0);

  it('1X2 suma 1', () => {
    const p = ['HOME', 'DRAW', 'AWAY'].map((s) => selectionDistributionFromMatrix(m, { marketKey: '1X2', selectionKey: s }).win);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(p[0]).toBeGreaterThan(p[2]);
  });

  it('AH 0 equivale a DNB y produce push en el empate', () => {
    const ah = selectionDistributionFromMatrix(m, { marketKey: 'AH', selectionKey: 'HOME', line: 0 });
    const dnb = selectionDistributionFromMatrix(m, { marketKey: 'DNB', selectionKey: 'HOME' });
    expect(ah.win).toBeCloseTo(dnb.win, 12);
    expect(ah.push).toBeGreaterThan(0);
    expect(fairOddsFromDistribution(ah)).toBeCloseTo(1 + ah.loss / ah.win, 10);
  });

  it('líneas de cuarto generan medias', () => {
    const d = selectionDistributionFromMatrix(m, { marketKey: 'AH', selectionKey: 'HOME', line: -0.25 });
    expect(d.halfLoss).toBeGreaterThan(0);
    const sum = d.win + d.halfWin + d.push + d.halfLoss + d.loss;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('over/under complementarios en línea .5 y BTTS consistente', () => {
    const over = selectionDistributionFromMatrix(m, { marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 2.5 });
    const under = selectionDistributionFromMatrix(m, { marketKey: 'OU_GOALS', selectionKey: 'UNDER', line: 2.5 });
    expect(over.win + under.win).toBeCloseTo(1, 10);
    const btts = selectionDistributionFromMatrix(m, { marketKey: 'BTTS', selectionKey: 'YES' }).win;
    const pHomeScores = 1 - sumMatrix(m, (h) => h === 0);
    expect(btts).toBeLessThan(pHomeScores);
  });

  it('totales Poisson para córners', () => {
    const over = totalsDistribution(10, 9.5, 'OVER');
    const under = totalsDistribution(10, 9.5, 'UNDER');
    expect(effectiveProbability(over) + effectiveProbability(under)).toBeCloseTo(1, 6);
  });
});

describe('Elo', () => {
  it('expectativa simétrica y multiplicador por diferencia de goles', () => {
    expect(eloExpectedScore(1500, 1500, 0)).toBeCloseTo(0.5, 12);
    expect(eloExpectedScore(1500, 1500)).toBeGreaterThan(0.5);
    expect(goalDifferenceMultiplier(1)).toBe(1);
    expect(goalDifferenceMultiplier(3)).toBeCloseTo(14 / 8, 12);
  });

  it('actualiza ratings y conserva la suma total', () => {
    const d = (s: string) => new Date(s);
    const matches = [
      { kickoff: d('2026-01-01'), homeTeamId: 'a', awayTeamId: 'b', homeGoals: 3, awayGoals: 0 },
      { kickoff: d('2026-01-08'), homeTeamId: 'b', awayTeamId: 'a', homeGoals: 0, awayGoals: 1 },
    ];
    const r = computeEloRatings(matches, d('2026-01-10'));
    expect(r.get('a')!.rating).toBeGreaterThan(1500);
    expect(r.get('a')!.rating + r.get('b')!.rating).toBeCloseTo(3000, 8);
  });

  it('lanza ante partidos posteriores al corte (anti fuga)', () => {
    expect(() =>
      computeEloRatings([{ kickoff: new Date('2026-02-01'), homeTeamId: 'a', awayTeamId: 'b', homeGoals: 1, awayGoals: 0 }], new Date('2026-01-01')),
    ).toThrow(/Fuga/);
  });

  it('1X2 desde Elo suma 1 y respeta la expectativa', () => {
    for (const e of [0.1, 0.35, 0.5, 0.72, 0.95]) {
      const p = eloToOneXTwo(e);
      expect(p.home + p.draw + p.away).toBeCloseTo(1, 10);
      expect(p.home + p.draw / 2).toBeCloseTo(e, 10);
      expect(Math.min(p.home, p.draw, p.away)).toBeGreaterThan(0);
    }
  });
});

describe('fuerzas de equipo', () => {
  const cutoff = new Date('2026-06-01');
  const matches: HistoricalMatch[] = Array.from({ length: 20 }, (_, i) => ({
    kickoff: new Date(cutoff.getTime() - (i + 1) * 7 * 86_400_000),
    homeTeamId: i % 2 ? 'strong' : 'weak',
    awayTeamId: i % 2 ? 'weak' : 'strong',
    homeGoals: i % 2 ? 3 : 0,
    awayGoals: i % 2 ? 0 : 2,
  }));

  it('el equipo fuerte ataca mejor que el débil en ambas condiciones', () => {
    const league = leagueAverages(matches, cutoff);
    const strong = computeTeamStrength('strong', matches, league, cutoff);
    const weak = computeTeamStrength('weak', matches, league, cutoff);
    expect(strong.home.scored).toBeGreaterThan(weak.home.scored);
    expect(strong.away.scored).toBeGreaterThan(weak.away.scored);
  });

  it('sin historial cae al prior de liga', () => {
    const league = leagueAverages([], cutoff);
    const s = computeTeamStrength('nobody', [], league, cutoff);
    expect(s.home.scored).toBeCloseTo(league.homeGoals, 10);
    expect(league.sampleSize).toBe(0);
  });
});
