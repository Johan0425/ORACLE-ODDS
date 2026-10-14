import { describe, expect, it } from 'vitest';
import {
  accuracy,
  applyCalibrator,
  bettingMetrics,
  bootstrapInterval,
  brierScore,
  expectedCalibrationError,
  fitCalibrator,
  fitIsotonic,
  fitPlatt,
  logLoss,
  multiclassBrier,
  oddsBucket,
  predictIsotonic,
  predictPlatt,
  profitUnits,
  reliabilityCurve,
  seededRandom,
  settleSelection,
  walkForwardSplit,
} from '../src';

describe('métricas probabilísticas', () => {
  it('Brier y log loss en casos conocidos', () => {
    expect(brierScore([1, 0], [1, 0])).toBe(0);
    expect(brierScore([0.5, 0.5], [1, 0])).toBeCloseTo(0.25, 12);
    expect(logLoss([0.5], [1])).toBeCloseTo(Math.log(2), 12);
    expect(multiclassBrier([[1, 0, 0]], [0])).toBe(0);
    expect(accuracy([0.7, 0.2], [1, 0])).toBe(1);
  });

  it('ECE ≈ 0 para un pronosticador calibrado y alto para uno sobreconfiado', () => {
    const rand = seededRandom(1);
    const preds: number[] = [];
    const outs: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const p = rand();
      preds.push(p);
      outs.push(rand() < p ? 1 : 0);
    }
    expect(expectedCalibrationError(preds, outs)).toBeLessThan(0.02);
    const overconfident = preds.map((p) => (p > 0.5 ? 0.99 : 0.01));
    expect(expectedCalibrationError(overconfident, outs)).toBeGreaterThan(0.15);
    expect(reliabilityCurve(preds, outs, 5)).toHaveLength(5);
  });
});

describe('calibración', () => {
  const rand = seededRandom(3);
  // Modelo sobreconfiado: la frecuencia real es 0.5 + (p − 0.5)/2.
  const preds = Array.from({ length: 3000 }, () => rand());
  const outs = preds.map((p) => (rand() < 0.5 + (p - 0.5) / 2 ? 1 : 0));

  it('isotónica es monótona y reduce el ECE', () => {
    const iso = fitIsotonic(preds, outs);
    for (let i = 1; i < iso.y.length; i++) expect(iso.y[i]).toBeGreaterThanOrEqual(iso.y[i - 1]);
    const calibrated = preds.map((p) => predictIsotonic(iso, p));
    expect(expectedCalibrationError(calibrated, outs)).toBeLessThan(expectedCalibrationError(preds, outs));
  });

  it('Platt aprende una pendiente < 1 para un modelo sobreconfiado', () => {
    const platt = fitPlatt(preds, outs);
    expect(platt.a).toBeLessThan(1);
    expect(predictPlatt(platt, 0.9)).toBeLessThan(0.9);
  });

  it('la política elige método según el tamaño de muestra', () => {
    expect(fitCalibrator(preds.slice(0, 50), outs.slice(0, 50)).method).toBe('identity');
    expect(fitCalibrator(preds.slice(0, 500), outs.slice(0, 500)).method).toBe('platt');
    expect(fitCalibrator(preds, outs).method).toBe('isotonic');
    expect(applyCalibrator(null, 0.3)).toBe(0.3);
  });
});

describe('métricas de apuestas', () => {
  it('ROI, hit rate, drawdown y CLV', () => {
    const m = bettingMetrics([
      { stake: 1, odds: 2, profit: 1, outcome: 'WIN', closingOdds: 1.8, settledAt: new Date(1) },
      { stake: 1, odds: 2, profit: -1, outcome: 'LOSS', closingOdds: 2.1, settledAt: new Date(2) },
      { stake: 1, odds: 2, profit: -1, outcome: 'LOSS', settledAt: new Date(3) },
      { stake: 1, odds: 2, profit: 0, outcome: 'VOID', settledAt: new Date(4) },
    ]);
    expect(m.bets).toBe(3);
    expect(m.voids).toBe(1);
    expect(m.roi).toBeCloseTo(-1 / 3, 10);
    expect(m.hitRate).toBeCloseTo(1 / 3, 10);
    expect(m.maxDrawdown).toBe(2);
    expect(m.avgClv).toBeCloseTo((2 / 1.8 - 1 + 2 / 2.1 - 1) / 2, 10);
  });

  it('bootstrap reproducible por semilla', () => {
    const sample = [1, -1, 1, 1, -1, 0.5, -1, 2];
    const mean = (s: number[]) => s.reduce((a, b) => a + b, 0) / s.length;
    const a = bootstrapInterval(sample, mean, { seed: 9 });
    const b = bootstrapInterval(sample, mean, { seed: 9 });
    expect(a).toEqual(b);
    expect(a!.lower).toBeLessThanOrEqual(a!.upper);
  });

  it('walk-forward respeta el orden temporal', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ at: new Date(2026, 0, 10 - i), i }));
    const { train, calibration, test } = walkForwardSplit(items);
    expect(train.length + calibration.length + test.length).toBe(10);
    expect(train[train.length - 1].at.getTime()).toBeLessThan(calibration[0].at.getTime());
    expect(calibration[calibration.length - 1].at.getTime()).toBeLessThan(test[0].at.getTime());
  });

  it('cubetas de cuota', () => {
    expect(oddsBucket(1.3)).toBe('1.01-1.49');
    expect(oddsBucket(2.2)).toBe('2.00-2.99');
    expect(oddsBucket(8)).toBe('5.00+');
  });
});

describe('liquidación', () => {
  const ft = (h: number, a: number, extra: object = {}) => ({ status: 'FINISHED' as const, homeScore: h, awayScore: a, ...extra });

  it('1X2, DC, DNB y BTTS', () => {
    expect(settleSelection({ marketKey: '1X2', selectionKey: 'HOME' }, ft(2, 1))).toBe('WIN');
    expect(settleSelection({ marketKey: '1X2', selectionKey: 'DRAW' }, ft(2, 1))).toBe('LOSS');
    expect(settleSelection({ marketKey: 'DC', selectionKey: 'HOME_DRAW' }, ft(1, 1))).toBe('WIN');
    expect(settleSelection({ marketKey: 'DNB', selectionKey: 'AWAY' }, ft(0, 0))).toBe('PUSH');
    expect(settleSelection({ marketKey: 'BTTS', selectionKey: 'YES' }, ft(1, 0))).toBe('LOSS');
  });

  it('over/under con líneas enteras y de cuarto', () => {
    expect(settleSelection({ marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 2.5 }, ft(2, 1))).toBe('WIN');
    expect(settleSelection({ marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 3 }, ft(2, 1))).toBe('PUSH');
    expect(settleSelection({ marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 2.75 }, ft(2, 1))).toBe('HALF_WIN');
    expect(settleSelection({ marketKey: 'OU_GOALS', selectionKey: 'OVER', line: 2.25 }, ft(1, 1))).toBe('HALF_LOSS');
    expect(settleSelection({ marketKey: 'OU_GOALS', selectionKey: 'UNDER', line: 2.25 }, ft(1, 1))).toBe('HALF_WIN');
  });

  it('hándicap asiático y europeo', () => {
    expect(settleSelection({ marketKey: 'AH', selectionKey: 'HOME', line: -1 }, ft(2, 1))).toBe('PUSH');
    expect(settleSelection({ marketKey: 'AH', selectionKey: 'HOME', line: -1.5 }, ft(2, 1))).toBe('LOSS');
    expect(settleSelection({ marketKey: 'AH', selectionKey: 'AWAY', line: -0.75 }, ft(2, 1))).toBe('HALF_LOSS');
    expect(settleSelection({ marketKey: 'EH', selectionKey: 'DRAW', line: -1 }, ft(2, 1))).toBe('WIN');
  });

  it('córners/tarjetas/mitades sin dato → VOID; partido cancelado → VOID', () => {
    expect(settleSelection({ marketKey: 'OU_CORNERS', selectionKey: 'OVER', line: 9.5 }, ft(1, 0))).toBe('VOID');
    expect(settleSelection({ marketKey: 'OU_CORNERS', selectionKey: 'OVER', line: 9.5 }, ft(1, 0, { totalCorners: 11 }))).toBe('WIN');
    expect(settleSelection({ marketKey: '1X2_H1', selectionKey: 'HOME' }, ft(1, 0))).toBe('VOID');
    expect(settleSelection({ marketKey: '1X2', selectionKey: 'HOME' }, { status: 'CANCELLED', homeScore: 0, awayScore: 0 })).toBe('VOID');
  });

  it('beneficio en unidades', () => {
    expect(profitUnits('WIN', 1, 2.5)).toBe(1.5);
    expect(profitUnits('HALF_WIN', 2, 2)).toBe(1);
    expect(profitUnits('HALF_LOSS', 2, 2)).toBe(-1);
    expect(profitUnits('PUSH', 1, 3)).toBe(0);
  });
});
