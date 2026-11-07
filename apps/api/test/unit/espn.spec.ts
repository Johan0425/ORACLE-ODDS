import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from '../../src/config/env';
import { EspnAdapter } from '../../src/providers/espn/espn.adapter';
import { DEFAULT_ESPN_LEAGUES, mapEspnStatus, mapScoreboard, mapStandings, parseAmerican } from '../../src/providers/espn/espn.mappers';
import { monthsBetween } from '../../src/modules/ingestion/espn-sync.service';
import { weekRange } from '../../src/modules/picks/picks.service';
import { RECORDING_ANCHOR, recordedFetch } from '../helpers/recorded';

const raw = (file: string) => JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'espn', file), 'utf8'));
const baseEnv = (extra: Record<string, string> = {}) => parseEnv({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'test', ...extra });

describe('ESPN mappers', () => {
  const fetchedAt = new Date(RECORDING_ANCHOR);
  const m = mapScoreboard('col.1', raw('scoreboard.json'), fetchedAt);

  it('normaliza partidos terminados, en vivo, programados y aplazados e ignora eventos malformados', () => {
    expect(m.fixtures).toHaveLength(4);
    const [done, live, next, postponed] = m.fixtures;
    expect(done).toMatchObject({ status: 'FINISHED', homeScore: 2, awayScore: 1, htHomeScore: 1, htAwayScore: 0, ref: { provider: 'ESPN', externalId: '900001' } });
    expect(done.league).toMatchObject({ name: 'Liga BetPlay', country: { name: 'Colombia' }, season: { label: '2026', current: true } });
    expect(done.home).toMatchObject({ name: 'Atlético Prueba', logoUrl: 'https://example.test/7001.png' });
    expect(live).toMatchObject({ status: 'LIVE', elapsedMinutes: 67, period: '2H', homeScore: 0, awayScore: 0 });
    // Un partido no iniciado nunca lleva marcador (ESPN entrega "0").
    expect(next).toMatchObject({ status: 'SCHEDULED', homeScore: null, awayScore: null });
    expect(postponed.status).toBe('POSTPONED');
  });

  it('solo toma cuotas de partidos no iniciados y las convierte de americanas a decimales', () => {
    expect(m.odds).toHaveLength(1);
    const e = m.odds[0];
    expect(e.fixtureRef).toEqual({ provider: 'ESPN', externalId: '900003' });
    const price = (market: string, sel: string) => e.prices.find((p) => p.marketKey === market && p.selectionKey === sel);
    expect(price('1X2', 'HOME')?.priceDecimal).toBeCloseTo(1.952, 3);
    expect(price('1X2', 'DRAW')?.priceDecimal).toBeCloseTo(3.35, 3);
    expect(price('1X2', 'AWAY')?.priceDecimal).toBeCloseTo(3.75, 3);
    expect(price('OU_GOALS', 'OVER')).toMatchObject({ line: 2.5 });
    expect(price('AH', 'AWAY')).toMatchObject({ line: -0.5 });
    expect(e.prices.every((p) => p.bookmaker.key === 'draftkings' && !p.isLive)).toBe(true);
  });

  it('interpreta cuotas americanas y estados', () => {
    expect(parseAmerican('+100')).toBe(2);
    expect(parseAmerican('EVEN')).toBe(2);
    expect(parseAmerican('-200')).toBe(1.5);
    expect(parseAmerican('abc')).toBeNull();
    expect(parseAmerican('50')).toBeNull();
    expect(mapEspnStatus('STATUS_HALFTIME', 'in')).toBe('LIVE');
    expect(mapEspnStatus('STATUS_FINAL_PEN', 'post')).toBe('FINISHED');
    expect(mapEspnStatus('STATUS_CANCELED', 'post')).toBe('CANCELLED');
  });

  it('mapea la clasificación', () => {
    const rows = mapStandings('col.1', raw('standings.json'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ season: '2026', group: null, rank: 1, points: 36, played: 17, won: 11, drawn: 3, lost: 3, goalsFor: 33, goalsAgainst: 14 });
  });
});

describe('EspnAdapter', () => {
  it('pide el año completo con límite alto y usa la lista por defecto de ligas', async () => {
    const { fetch, calls } = recordedFetch([{ match: /scoreboard/, body: raw('scoreboard.json') }]);
    const a = new EspnAdapter(baseEnv(), fetch);
    expect(a.isConfigured()).toBe(true);
    expect(a.leagues).toEqual(DEFAULT_ESPN_LEAGUES);
    const r = await a.season('col.1', 2026);
    expect(r.fixtures.length).toBe(4);
    expect(calls[0]).toContain('/site/v2/sports/soccer/col.1/scoreboard?dates=2026&limit=1000');
    await a.month('col.1', new Date('2026-03-15T00:00:00Z'));
    expect(calls[1]).toContain('dates=202603');
  });

  it('se puede desactivar y usa ligas configuradas', async () => {
    const off = new EspnAdapter(baseEnv({ ENABLE_ESPN: 'false' }));
    expect(off.isConfigured()).toBe(false);
    await expect(off.season('col.1', 2026)).rejects.toThrow('ESPN desactivado');
    expect(new EspnAdapter(baseEnv({ ESPN_LEAGUES: 'col.1, eng.1' })).leagues).toEqual(['col.1', 'eng.1']);
  });
});

describe('ventanas de tiempo', () => {
  it('monthsBetween cubre todos los meses del intervalo', () => {
    const months = monthsBetween(new Date('2026-10-28T00:00:00Z'), new Date('2027-01-05T00:00:00Z'));
    expect(months.map((d) => d.toISOString().slice(0, 7))).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
  });

  it('weekRange va de lunes a lunes en hora de Bogotá', () => {
    const now = new Date('2026-11-07T20:00:00Z'); // sábado
    const current = weekRange(0, 'America/Bogota', now);
    expect(current.gte.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(current.lt.toISOString()).toBe('2026-11-09T05:00:00.000Z');
    expect(weekRange(-1, 'America/Bogota', now).gte.toISOString()).toBe('2026-10-26T05:00:00.000Z');
    expect(weekRange(1, 'America/Bogota', now).lt.toISOString()).toBe('2026-11-16T05:00:00.000Z');
  });
});
