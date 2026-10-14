import { describe, expect, it } from 'vitest';
import {
  analyzeCombination,
  analyzeSystem,
  areContradictory,
  buildScoreMatrix,
  jointProbabilityFromMatrix,
  logLinearPool,
  poissonBinomial,
  predictFootballFixture,
  seededRandom,
  simulateBankroll,
  suggestStake,
  SPORT_MODELS,
  type ComboLeg,
  type HistoricalMatch,
} from '../src';

function syntheticLeague(seed: number, cutoff: Date): HistoricalMatch[] {
  const rand = seededRandom(seed);
  const teams = ['t1', 't2', 't3', 't4', 't5', 't6'];
  const strength: Record<string, number> = { t1: 1.6, t2: 1.3, t3: 1.1, t4: 1.0, t5: 0.8, t6: 0.6 };
  const poisson = (l: number) => {
    let k = 0;
    let p = 1;
    const L = Math.exp(-l);
    do {
      k++;
      p *= rand();
    } while (p > L);
    return k - 1;
  };
  const out: HistoricalMatch[] = [];
  for (let round = 0; round < 30; round++) {
    for (let i = 0; i < teams.length; i += 2) {
      const h = teams[(i + round) % 6];
      const a = teams[(i + 1 + round * 2) % 6];
      if (h === a) continue;
      const hg = poisson(1.35 * strength[h] / strength[a] ** 0.5);
      const ag = poisson(1.05 * strength[a] / strength[h] ** 0.5);
      out.push({
        kickoff: new Date(cutoff.getTime() - (round + 1) * 7 * 86_400_000 - i * 3_600_000),
        homeTeamId: h,
        awayTeamId: a,
        homeGoals: hg,
        awayGoals: ag,
        htHomeGoals: Math.min(hg, poisson(0.6)),
        htAwayGoals: Math.min(ag, poisson(0.45)),
        homeCorners: 4 + poisson(1.5),
        awayCorners: 3 + poisson(1.2),
        homeCards: poisson(1.8),
        awayCards: poisson(2.0),
      });
    }
  }
  return out;
}

describe('ensemble de fútbol', () => {
  const kickoff = new Date('2026-10-20T19:00:00Z');
  const cutoff = new Date('2026-10-20T13:00:00Z');
  const league = syntheticLeague(11, cutoff);
  const input = {
    fixtureId: 'f1',
    homeTeamId: 't1',
    awayTeamId: 't6',
    homeTeamName: 'Fuerte',
    awayTeamName: 'Débil',
    kickoff,
    dataCutoff: cutoff,
    leagueMatches: league,
    teamMatches: league.filter((m) => ['t1', 't6'].includes(m.homeTeamId) || ['t1', 't6'].includes(m.awayTeamId)),
    lineupsConfirmed: false,
  };

  it('genera mercados coherentes, versionados y con intervalo', () => {
    const p = predictFootballFixture(input, new Date('2026-10-20T13:00:00Z'));
    expect(p.modelVersion).toMatch(/^football-ensemble-/);
    const oneXTwo = p.selections.filter((s) => s.marketKey === '1X2');
    expect(oneXTwo.reduce((s, x) => s + x.rawProbability, 0)).toBeCloseTo(1, 3);
    const home = oneXTwo.find((s) => s.selectionKey === 'HOME')!;
    const away = oneXTwo.find((s) => s.selectionKey === 'AWAY')!;
    expect(home.rawProbability).toBeGreaterThan(away.rawProbability);
    for (const s of p.selections) {
      expect(s.uncertaintyLower).toBeLessThanOrEqual(s.calibratedProbability + 1e-9);
      expect(s.uncertaintyUpper).toBeGreaterThanOrEqual(s.calibratedProbability - 1e-9);
      expect(s.fairOdds).toBeGreaterThan(1);
    }
    expect(p.selections.some((s) => s.marketKey === 'OU_CORNERS')).toBe(true);
    expect(p.selections.some((s) => s.marketKey === '1X2_H1')).toBe(true);
    expect(p.confidenceReductions).toContain('Alineaciones no confirmadas');
    // Sin calibrador ninguna selección se marca como calibrada.
    expect(p.selections.every((s) => !s.calibrated)).toBe(true);
  });

  it('rechaza datos posteriores al corte (anti fuga)', () => {
    const leaky = [...league, { kickoff: new Date('2026-10-20T14:00:00Z'), homeTeamId: 't1', awayTeamId: 't2', homeGoals: 1, awayGoals: 0 }];
    expect(() => predictFootballFixture({ ...input, leagueMatches: leaky })).toThrow(/Fuga/);
    expect(() => predictFootballFixture({ ...input, market: { oneXTwo: { HOME: 0.6, DRAW: 0.25, AWAY: 0.15 }, capturedAt: new Date('2026-10-20T18:00:00Z') } })).toThrow(/Fuga/);
  });

  it('el consenso de mercado mueve la estimación pero no la copia', () => {
    const base = predictFootballFixture(input).selections.find((s) => s.marketKey === '1X2' && s.selectionKey === 'HOME')!.rawProbability;
    const withMarket = predictFootballFixture({ ...input, market: { oneXTwo: { HOME: 0.4, DRAW: 0.3, AWAY: 0.3 }, capturedAt: cutoff } }).selections.find(
      (s) => s.marketKey === '1X2' && s.selectionKey === 'HOME',
    )!.rawProbability;
    expect(withMarket).toBeLessThan(base);
    expect(withMarket).toBeGreaterThan(0.4);
  });

  it('pooling log-lineal normaliza', () => {
    const p = logLinearPool([{ probs: [0.5, 0.3, 0.2], weight: 1 }, { probs: [0.2, 0.3, 0.5], weight: 1 }]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(p[0]).toBeCloseTo(p[2], 12);
  });

  it('deportes sin modelo no predicen', () => {
    expect(SPORT_MODELS.BASKETBALL.implemented).toBe(false);
    expect(() => SPORT_MODELS.TENNIS.predict({})).toThrow();
  });
});

describe('combinadas y correlación', () => {
  const leg = (id: string, fixtureId: string, marketKey: string, selectionKey: string, odds: number, probability: number, line?: number): ComboLeg => ({
    id,
    fixtureId,
    marketKey,
    selectionKey,
    odds,
    probability,
    line,
    kickoff: new Date('2030-01-01'),
  });

  it('detecta selecciones contradictorias', () => {
    expect(areContradictory(leg('a', 'f', '1X2', 'HOME', 2, 0.5), leg('b', 'f', '1X2', 'AWAY', 3, 0.3))).toBe(true);
    expect(areContradictory(leg('a', 'f', 'OU_GOALS', 'OVER', 2, 0.5, 3.5), leg('b', 'f', 'OU_GOALS', 'UNDER', 2, 0.5, 2.5))).toBe(true);
    expect(areContradictory(leg('a', 'f', 'OU_GOALS', 'OVER', 2, 0.5, 2.5), leg('b', 'f', 'OU_GOALS', 'UNDER', 2, 0.5, 3.5))).toBe(false);
    expect(areContradictory(leg('a', 'f', 'DC', 'DRAW_AWAY', 2, 0.5), leg('b', 'f', '1X2', 'HOME', 2, 0.5))).toBe(true);
    expect(areContradictory(leg('a', 'f', '1X2', 'HOME', 2, 0.5), leg('b', 'g', '1X2', 'AWAY', 2, 0.5))).toBe(false);
  });

  it('partidos distintos: producto con independencia aproximada', () => {
    const r = analyzeCombination([leg('a', 'f1', '1X2', 'HOME', 2, 0.55), leg('b', 'f2', 'BTTS', 'YES', 1.9, 0.55)], { now: new Date('2029-01-01') });
    expect(r.combinedOdds).toBe(3.8);
    expect(r.adjustedProbability).toBeCloseTo(0.3025, 10);
    expect(r.expectedValue).toBeCloseTo(0.3025 * 3.8 - 1, 10);
    expect(r.probabilityIsApproximate).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('mismo partido con matriz: probabilidad conjunta exacta (no producto ciego)', () => {
    const m = buildScoreMatrix(1.8, 0.9);
    const legs = [leg('a', 'f', '1X2', 'HOME', 1.8, 0.55), leg('b', 'f', 'OU_GOALS', 'OVER', 1.9, 0.55, 2.5)];
    const joint = jointProbabilityFromMatrix(m, legs);
    const r = analyzeCombination(legs, { now: new Date('2029-01-01'), scoreMatrices: { f: m } });
    expect(r.adjustedProbability).toBeCloseTo(joint, 10);
    expect(r.issues.some((i) => i.code === 'SAME_FIXTURE_CORRELATION')).toBe(true);
  });

  it('mismo partido sin matriz: penalización visible', () => {
    const r = analyzeCombination([leg('a', 'f', 'OU_CORNERS', 'OVER', 1.9, 0.5, 9.5), leg('b', 'f', '1X2', 'HOME', 2, 0.5)], { now: new Date('2029-01-01') });
    expect(r.correlationPenalty).toBeCloseTo(0.1, 10);
    expect(r.adjustedProbability).toBeCloseTo(0.25 * 0.9, 10);
  });

  it('bloquea contradicciones y partidos iniciados', () => {
    const r = analyzeCombination([leg('a', 'f', '1X2', 'HOME', 2, 0.5), leg('b', 'f', '1X2', 'DRAW', 3, 0.3)], { now: new Date('2029-01-01') });
    expect(r.blocked).toBe(true);
    const started = analyzeCombination([{ ...leg('a', 'f', '1X2', 'HOME', 2, 0.5), kickoff: new Date('2020-01-01') }]);
    expect(started.issues.some((i) => i.code === 'STARTED')).toBe(true);
  });

  it('sistemas k/n', () => {
    const legs = [leg('a', 'f1', '1X2', 'HOME', 2, 0.5), leg('b', 'f2', '1X2', 'HOME', 2, 0.5), leg('c', 'f3', '1X2', 'HOME', 2, 0.5)];
    const s = analyzeSystem(legs, 2, 3);
    expect(s.combinations).toBe(3);
    expect(s.stakePerCombination).toBe(1);
    expect(s.maxReturn).toBe(12);
    expect(s.probabilityAnyReturn).toBeCloseTo(0.5, 10);
    expect(s.expectedReturn).toBeCloseTo(3, 10);
    expect(poissonBinomial([0.5, 0.5])).toEqual([0.25, 0.5, 0.25]);
  });
});

describe('bankroll educativo', () => {
  it('Kelly fraccional prudente con topes', () => {
    expect(suggestStake(0.6, 2).units).toBe(2);
    expect(suggestStake(0.6, 2).cappedBy).toBe('max_per_bet');
    expect(suggestStake(0.45, 2).cappedBy).toBe('no_edge');
    expect(suggestStake(0.6, 2, {}, { dailyUnits: 4.5 }).units).toBe(0.5);
    expect(suggestStake(0.6, 2, { method: 'flat', unitsPerBet: 1 }).units).toBe(1);
  });

  it('la simulación es reproducible y muestra riesgo de pérdida', () => {
    const a = simulateBankroll({ probability: 0.52, odds: 2 }, 200, {}, 300, 1);
    const b = simulateBankroll({ probability: 0.52, odds: 2 }, 200, {}, 300, 1);
    expect(a).toEqual(b);
    expect(a.probabilityOfLoss).toBeGreaterThan(0);
    expect(a.p5Final).toBeLessThanOrEqual(a.p95Final);
  });
});
