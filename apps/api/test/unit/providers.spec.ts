import { parseEnv } from '../../src/config/env';
import { ApiFootballAdapter } from '../../src/providers/api-football/api-football.adapter';
import { mapStatus, mapOdds } from '../../src/providers/api-football/api-football.mappers';
import { OddsApiAdapter } from '../../src/providers/the-odds-api/odds-api.adapter';
import { mapOddsEvents, sportFromKey } from '../../src/providers/the-odds-api/odds-api.mappers';
import { mapOddsApiIoEvent, OddsApiIoAdapter } from '../../src/providers/odds-api-io/odds-api-io.adapter';
import { TheSportsDbAdapter } from '../../src/providers/thesportsdb/thesportsdb.adapter';
import { ProviderHttpError } from '../../src/common/http/provider-http-client';
import { recorded, recordedFetch } from '../helpers/recorded';

const baseEnv = (extra: Record<string, string> = {}) => parseEnv({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'test', ...extra });

describe('ApiFootballAdapter', () => {
  const env = baseEnv({ API_FOOTBALL_KEY: 'test-key', TRACKED_LEAGUES: '9001' });

  it('sin clave no está configurado y no inventa datos', async () => {
    const a = new ApiFootballAdapter(baseEnv());
    expect(a.isConfigured()).toBe(false);
    await expect(a.getLiveFixtures()).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it('normaliza partidos históricos, próximos y en vivo', async () => {
    const { fetch, calls } = recordedFetch([
      { match: /fixtures\?.*live=/, file: 'api-football/fixtures-live.json' },
      { match: /fixtures\?.*from=/, file: 'api-football/fixtures-upcoming.json' },
    ]);
    const a = new ApiFootballAdapter(env, undefined, fetch);
    const upcoming = await a.getFixtures({ leagueId: '9001', season: '2026', from: new Date(), to: new Date(Date.now() + 14 * 86_400_000) });
    expect(upcoming).toHaveLength(3);
    expect(upcoming[0]).toMatchObject({ sport: 'FOOTBALL', status: 'SCHEDULED', homeScore: null, ref: { provider: 'API_FOOTBALL', externalId: '600001' } });
    expect(upcoming[0].kickoff.getTime()).toBeGreaterThan(Date.now());
    const live = await a.getLiveFixtures(['9001']);
    expect(live[0]).toMatchObject({ status: 'LIVE', period: '1H', elapsedMinutes: 31, homeScore: 1, awayScore: 0 });
    expect(calls.every((c) => !c.includes('test-key'))).toBe(true);
  });

  it('mapea estadísticas, eventos, alineaciones, lesiones y clasificación', async () => {
    const { fetch } = recordedFetch([
      { match: /fixtures\/statistics/, file: 'api-football/statistics.json' },
      { match: /fixtures\/events/, file: 'api-football/events.json' },
      { match: /fixtures\/lineups/, file: 'api-football/lineups.json' },
      { match: /injuries/, file: 'api-football/injuries.json' },
      { match: /standings/, file: 'api-football/standings.json' },
    ]);
    const a = new ApiFootballAdapter(env, undefined, fetch);
    const stats = await a.getFixtureStatistics('1');
    expect(stats[0]).toMatchObject({ corners: 7, possession: 58, expectedGoals: 1.72, yellowCards: 2, redCards: null });
    expect((await a.getFixtureEvents('600003'))[0]).toMatchObject({ minute: 12, type: 'Goal', playerName: 'J. Pruebas' });
    const lineups = await a.getLineups('600001');
    expect(lineups[0].startXI).toHaveLength(11);
    expect((await a.getInjuries('600001'))[0]).toMatchObject({ status: 'out', reason: 'Knee Injury' });
    expect(await a.getStandings('9001', '2026')).toHaveLength(6);
  });

  it('trata `errors` en una respuesta 200 como fallo sin exponer el detalle', async () => {
    const { fetch } = recordedFetch([{ match: /odds/, file: 'api-football/error-plan.json' }]);
    const a = new ApiFootballAdapter(baseEnv({ API_FOOTBALL_KEY: 'k', ENABLE_API_FOOTBALL_ODDS: 'true' }), undefined, fetch);
    await expect(a.getFixtureOdds('1')).rejects.toThrow(/reportó errores \(plan\)/);
  });

  it('mapea estados del proveedor', () => {
    expect(mapStatus('NS').status).toBe('SCHEDULED');
    expect(mapStatus('HT')).toEqual({ status: 'LIVE', period: 'HT' });
    expect(mapStatus('PEN').status).toBe('FINISHED');
    expect(mapStatus('PST').status).toBe('POSTPONED');
    expect(mapStatus('AWD').status).toBe('CANCELLED');
  });

  it('mapea cuotas de API-Football a mercados canónicos con línea desde el local', () => {
    const [e] = mapOdds([
      {
        fixture: { id: 1 },
        update: '2026-10-14T10:00:00+00:00',
        bookmakers: [
          {
            id: 8,
            name: 'Casa Ejemplo',
            bets: [
              { name: 'Match Winner', values: [{ value: 'Home', odd: '1.80' }, { value: 'Draw', odd: '3.50' }, { value: 'Away', odd: '4.20' }] },
              { name: 'Asian Handicap', values: [{ value: 'Away +1', odd: '1.90' }] },
              { name: 'Exact Score', values: [{ value: '2:1', odd: '9.00' }] },
              { name: 'Unknown bet', values: [{ value: 'x', odd: '2' }] },
            ],
          },
        ],
      },
    ]);
    expect(e.prices.find((p) => p.marketKey === '1X2' && p.selectionKey === 'HOME')?.priceDecimal).toBe(1.8);
    expect(e.prices.find((p) => p.marketKey === 'AH')).toMatchObject({ selectionKey: 'AWAY', line: -1 });
    expect(e.prices.find((p) => p.marketKey === 'CS')?.selectionKey).toBe('2-1');
    expect(e.prices).toHaveLength(5);
  });
});

describe('OddsApiAdapter', () => {
  const env = baseEnv({ THE_ODDS_API_KEY: 'odds-key', ODDS_REGIONS: 'eu', ODDS_MARKETS: 'h2h,totals,spreads' });

  it('normaliza h2h, totals y spreads de varias casas', async () => {
    const { fetch, calls } = recordedFetch([{ match: /\/odds/, file: 'the-odds-api/odds-1.json', headers: { 'x-requests-remaining': '480' } }]);
    const a = new OddsApiAdapter(env, undefined, fetch);
    const events = await a.getOdds('soccer_testland_liga');
    expect(events).toHaveLength(2);
    const alfa = events[0];
    expect(alfa.sport).toBe('FOOTBALL');
    expect(new Set(alfa.prices.map((p) => p.bookmaker.key)).size).toBe(4);
    expect(alfa.prices.find((p) => p.bookmaker.key === 'casa_dos' && p.marketKey === '1X2' && p.selectionKey === 'DRAW')?.priceDecimal).toBe(3.9);
    expect(alfa.prices.find((p) => p.marketKey === 'AH' && p.selectionKey === 'AWAY')?.line).toBe(-0.5);
    expect(alfa.prices.find((p) => p.marketKey === 'OU_GOALS' && p.selectionKey === 'OVER')?.line).toBe(2.5);
    expect(alfa.prices.every((p) => !p.isLive)).toBe(true);
    expect(calls[0]).toContain('markets=h2h%2Ctotals%2Cspreads');
  });

  it('marca como en vivo los eventos ya iniciados', () => {
    const items = recorded<unknown[]>('the-odds-api/odds-1.json', Date.now() - 3 * 86_400_000);
    const { events } = mapOddsEvents(items);
    expect(events[0].prices.every((p) => p.isLive)).toBe(true);
  });

  it('mapea deportes y descarta formatos desconocidos', () => {
    expect(sportFromKey('basketball_nba')).toBe('BASKETBALL');
    expect(sportFromKey('cricket_test')).toBeNull();
    expect(mapOddsEvents([{ foo: 1 }]).rejected).toBe(1);
  });

  it('normaliza resultados', async () => {
    const { fetch } = recordedFetch([{ match: /scores/, file: 'the-odds-api/scores.json' }]);
    const r = await new OddsApiAdapter(env, undefined, fetch).getResults('soccer_testland_liga', 1);
    expect(r[0]).toMatchObject({ completed: true, homeScore: 2, awayScore: 0 });
  });

  it('el histórico solo opera con el flag activo', async () => {
    const a = new OddsApiAdapter(env, undefined, recordedFetch([]).fetch);
    expect(await a.getHistoricalOdds('soccer_epl', new Date())).toEqual([]);
  });
});

describe('OddsApiIoAdapter (opcional)', () => {
  it('requiere feature flag y clave', () => {
    expect(new OddsApiIoAdapter(baseEnv({ ODDS_API_IO_KEY: 'k' })).isConfigured()).toBe(false);
    expect(new OddsApiIoAdapter(baseEnv({ ODDS_API_IO_KEY: 'k', ENABLE_ODDS_API_IO: 'true' })).isConfigured()).toBe(true);
  });

  it('mapea el formato documentado (ML/Spread/Totals/BTTS)', () => {
    const [raw] = recorded<unknown[]>('odds-api-io/odds-multi.json');
    const e = mapOddsApiIoEvent(raw, 'FOOTBALL')!;
    expect(e.prices.find((p) => p.marketKey === '1X2' && p.selectionKey === 'DRAW')?.priceDecimal).toBe(3.95);
    expect(e.prices.find((p) => p.marketKey === 'AH' && p.selectionKey === 'AWAY')?.line).toBe(-0.5);
    expect(e.prices.find((p) => p.marketKey === 'BTTS' && p.selectionKey === 'YES')?.priceDecimal).toBe(1.8);
    expect(e.prices[0].bookmaker.key).toBe('casa-cuatro');
  });
});

describe('TheSportsDbAdapter', () => {
  it('solo devuelve metadatos con coincidencia exacta', async () => {
    const { fetch } = recordedFetch([{ match: /searchteams/, body: { teams: [{ strTeam: 'Club Alfa', strBadge: 'https://img/alfa.png', strStadium: 'Estadio Alfa', strSport: 'Soccer' }] } }]);
    const a = new TheSportsDbAdapter(baseEnv({ THESPORTSDB_KEY: '3' }), fetch);
    expect(await a.findTeamBadge('Club Alfa')).toEqual({ logoUrl: 'https://img/alfa.png', venueName: 'Estadio Alfa' });
    expect(await a.findTeamBadge('Otro Club')).toBeNull();
  });
});
