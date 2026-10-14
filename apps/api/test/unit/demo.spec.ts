import { demoOdds, generateDemoSeason, DEMO_BOOKMAKERS } from '../../src/modules/demo/demo.generator';

describe('generador de demo', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  const season = generateDemoSeason(now);

  it('es determinista y marca todo con el proveedor DEMO', () => {
    expect(generateDemoSeason(now).map((m) => m.fixture.ref.externalId)).toEqual(season.map((m) => m.fixture.ref.externalId));
    expect(season.every((m) => m.fixture.ref.provider === 'DEMO' && m.fixture.home.ref.provider === 'DEMO')).toBe(true);
  });

  it('genera ≥ 100 partidos próximos, historial, jornada reciente y 2 en vivo', () => {
    const count = (p: string) => season.filter((m) => m.phase === p).length;
    expect(count('upcoming')).toBeGreaterThanOrEqual(100);
    expect(count('history')).toBeGreaterThan(400);
    expect(count('recent')).toBe(24);
    expect(count('live')).toBe(2);
    expect(season.filter((m) => m.phase === 'upcoming').every((m) => m.fixture.kickoff > now)).toBe(true);
  });

  it('cuotas con margen positivo por casa y casas claramente ficticias', () => {
    const e = demoOdds(season.find((m) => m.phase === 'upcoming')!, now, 1);
    for (const b of DEMO_BOOKMAKERS) {
      expect(b.key.startsWith('demo-')).toBe(true);
      expect(b.name).toContain('(demo)');
      const book = e.prices.filter((p) => p.bookmaker.key === b.key && p.marketKey === '1X2').reduce((s, p) => s + 1 / p.priceDecimal, 0);
      expect(book).toBeGreaterThan(1);
    }
  });
});
