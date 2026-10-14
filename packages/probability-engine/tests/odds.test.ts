import { describe, expect, it } from 'vitest';
import {
  americanToDecimal,
  compareQuotes,
  consensusNoVig,
  decimalToAmerican,
  detectArbitrage,
  edge,
  expectedValue,
  fairOdds,
  fractionalToDecimal,
  freshnessScore,
  impliedProbability,
  isStale,
  kellyFraction,
  lineKey,
  LIVE_FRESHNESS,
  overround,
  qualityScore,
  removeVig,
  suggestedStakeUnits,
} from '../src';

describe('conversión de cuotas', () => {
  it('probabilidad implícita y cuota justa son inversas', () => {
    expect(impliedProbability(2.5)).toBeCloseTo(0.4, 10);
    expect(fairOdds(0.4)).toBeCloseTo(2.5, 10);
  });

  it('rechaza cuotas y probabilidades inválidas', () => {
    expect(() => impliedProbability(1)).toThrow();
    expect(() => impliedProbability(Number.NaN)).toThrow();
    expect(() => fairOdds(0)).toThrow();
  });

  it('convierte americanas y fraccionales', () => {
    expect(americanToDecimal(150)).toBeCloseTo(2.5, 10);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 10);
    expect(decimalToAmerican(2.5)).toBe(150);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(fractionalToDecimal(5, 2)).toBeCloseTo(3.5, 10);
  });

  it('normaliza líneas para claves estables', () => {
    expect(lineKey(2.5)).toBe('2.5');
    expect(lineKey(2.50000001)).toBe('2.5');
    expect(lineKey(null)).toBe('');
    expect(lineKey(-0)).toBe('0');
  });
});

describe('remoción del margen (vig)', () => {
  const book = [1.9, 3.6, 4.2];

  it('calcula el overround', () => {
    expect(overround([1.909, 1.909])).toBeCloseTo(1.0477, 3);
  });

  it.each(['proportional', 'power', 'shin'] as const)('%s produce probabilidades que suman 1', (method) => {
    const r = removeVig(book, method);
    expect(r.probabilities.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 8);
    r.probabilities.forEach((p, i) => expect(p).toBeLessThan(1 / book[i]));
  });

  it('proporcional divide por el overround', () => {
    const r = removeVig([2, 2], 'proportional');
    expect(r.probabilities).toEqual([0.5, 0.5]);
  });

  it('power y shin cargan más margen al underdog que el proporcional', () => {
    const prop = removeVig(book, 'proportional').probabilities;
    const pow = removeVig(book, 'power').probabilities;
    const sh = removeVig(book, 'shin').probabilities;
    expect(pow[0]).toBeGreaterThan(prop[0]);
    expect(pow[2]).toBeLessThan(prop[2]);
    expect(sh[0]).toBeGreaterThan(prop[0]);
    expect(removeVig(book, 'shin').shinZ).toBeGreaterThan(0);
  });

  it('exige al menos dos selecciones', () => {
    expect(() => removeVig([2])).toThrow();
  });
});

describe('edge, EV y Kelly', () => {
  it('edge = p modelo − p mercado sin vig', () => {
    expect(edge(0.55, 0.5)).toBeCloseTo(0.05, 10);
  });

  it('EV = p·cuota − 1', () => {
    expect(expectedValue(0.55, 2)).toBeCloseTo(0.1, 10);
    expect(expectedValue(0.8, 1.2)).toBeCloseTo(-0.04, 10);
  });

  it('una probabilidad alta con cuota baja puede tener EV negativo', () => {
    expect(expectedValue(0.8, 1.2)).toBeLessThan(0);
  });

  it('Kelly completo y fraccional con tope', () => {
    expect(kellyFraction(0.55, 2)).toBeCloseTo(0.1, 10);
    // 0.1 · 0.25 · 100 = 2.5 → tope 2 unidades
    expect(suggestedStakeUnits(0.55, 2)).toBe(2);
    expect(suggestedStakeUnits(0.52, 2, { maxUnits: 5 })).toBe(1);
    expect(suggestedStakeUnits(0.4, 2)).toBe(0);
  });
});

describe('frescura y calidad', () => {
  it('decae linealmente entre umbrales', () => {
    expect(freshnessScore(0)).toBe(1);
    expect(freshnessScore(10, LIVE_FRESHNESS)).toBe(1);
    expect(freshnessScore(70, LIVE_FRESHNESS)).toBeCloseTo(0.5, 5);
    expect(freshnessScore(500, LIVE_FRESHNESS)).toBe(0);
    expect(isStale(120, LIVE_FRESHNESS)).toBe(true);
  });

  const base = {
    edge: 0.06,
    expectedValue: 0.12,
    calibrationQuality: 0.9,
    freshness: 1,
    bookmakerCount: 6,
    uncertaintyWidth: 0.08,
    lineupsKnown: true,
    minutesToKickoff: 300,
    lowLiquidityMarket: false,
    priceMoveFromOpening: 0,
    dataQuality: 0.9,
  };

  it('puntúa alto una oportunidad sólida y fresca', () => {
    const r = qualityScore(base);
    expect(r.score).toBeGreaterThan(75);
    expect(r.penalties).toHaveLength(0);
  });

  it('penaliza cuota vencida, baja cobertura y mala calibración', () => {
    const r = qualityScore({ ...base, freshness: 0.2, bookmakerCount: 1, calibrationQuality: 0.4 });
    expect(r.penalties.map((p) => p.code)).toEqual(expect.arrayContaining(['STALE_ODDS', 'LOW_COVERAGE', 'POOR_CALIBRATION']));
    expect(r.score).toBeLessThan(qualityScore(base).score / 2);
  });

  it('penaliza movimiento adverso y alineaciones desconocidas cerca del inicio', () => {
    const r = qualityScore({ ...base, priceMoveFromOpening: 0.15, lineupsKnown: false, minutesToKickoff: 30 });
    expect(r.penalties.map((p) => p.code)).toEqual(expect.arrayContaining(['ADVERSE_MOVE', 'LINEUPS_UNKNOWN']));
  });
});

describe('comparador', () => {
  const quotes = [
    { bookmaker: 'a', selection: 'HOME', price: 2.0 },
    { bookmaker: 'b', selection: 'HOME', price: 2.2 },
    { bookmaker: 'a', selection: 'AWAY', price: 1.8 },
    { bookmaker: 'b', selection: 'AWAY', price: 1.7 },
  ];

  it('encuentra la mejor cuota y la diferencia frente al promedio', () => {
    const cmp = compareQuotes(quotes);
    const home = cmp.find((c) => c.selection === 'HOME')!;
    expect(home.best).toEqual({ bookmaker: 'b', price: 2.2 });
    expect(home.quotes[0].diffVsAverage).toBeCloseTo(2.2 / 2.1 - 1, 10);
  });

  it('consenso sin vig solo con libros completos', () => {
    const c = consensusNoVig([...quotes, { bookmaker: 'c', selection: 'HOME', price: 5 }], ['HOME', 'AWAY'], 'proportional')!;
    expect(c.books).toBe(2);
    expect(c.probabilities.HOME + c.probabilities.AWAY).toBeCloseTo(1, 10);
  });
});

describe('arbitraje', () => {
  it('detecta suma implícita < 1 y reparte stakes con retorno igual', () => {
    const r = detectArbitrage(
      [
        { selection: 'HOME', bookmaker: 'a', price: 2.1 },
        { selection: 'AWAY', bookmaker: 'b', price: 2.1 },
      ],
      100,
    );
    expect(r.isArbitrage).toBe(true);
    expect(r.theoreticalMargin).toBeCloseTo(0.05, 10);
    expect(r.stakes[0].stake).toBeCloseTo(50, 5);
    expect(r.stakes[0].theoreticalReturn).toBeCloseTo(r.stakes[1].theoreticalReturn, 5);
    expect(r.warning).not.toMatch(/garantizad/i);
  });

  it('no marca arbitraje en un libro con margen', () => {
    expect(detectArbitrage([
      { selection: 'HOME', bookmaker: 'a', price: 1.9 },
      { selection: 'AWAY', bookmaker: 'b', price: 1.9 },
    ]).isArbitrage).toBe(false);
  });
});
