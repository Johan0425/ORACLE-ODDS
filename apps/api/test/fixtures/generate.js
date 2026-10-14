/**
 * Genera respuestas "grabadas" con el formato exacto de cada proveedor para las
 * pruebas. Los equipos y la liga son ficticios y los marcadores se simulan con
 * una semilla fija: estos datos existen SOLO en el entorno de pruebas y nunca se
 * cargan en desarrollo ni producción. Las fechas se anclan en ANCHOR y el
 * cargador las desplaza al momento de ejecución (ver test/helpers/recorded.ts).
 *
 *   node test/fixtures/generate.js
 */
const fs = require('node:fs');
const path = require('node:path');

const ANCHOR = Date.parse('2026-10-14T12:00:00Z');
const DAY = 86_400_000;
let seed = 20261014;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const poisson = (l) => {
  let k = 0;
  let p = 1;
  const L = Math.exp(-l);
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
};

const TEAMS = [
  { id: 101, name: 'Club Alfa', s: 1.45 },
  { id: 102, name: 'Deportivo Beta', s: 1.2 },
  { id: 103, name: 'Atlético Gamma', s: 1.05 },
  { id: 104, name: 'Unión Delta', s: 0.95 },
  { id: 105, name: 'Real Épsilon', s: 0.85 },
  { id: 106, name: 'Sporting Zeta', s: 0.7 },
];
const LEAGUE = { id: 9001, name: 'Liga de Prueba', country: 'Testland', logo: null, flag: null, season: 2026 };

const fixtures = [];
let nextId = 500000;
for (let round = 0; round < 30; round++) {
  const order = [...TEAMS].sort(() => rand() - 0.5);
  for (let i = 0; i < 6; i += 2) {
    const h = order[i];
    const a = order[i + 1];
    const hg = poisson((1.4 * h.s) / Math.sqrt(a.s));
    const ag = poisson((1.05 * a.s) / Math.sqrt(h.s));
    const date = new Date(ANCHOR - (30 - round) * 7 * DAY + i * 3600_000).toISOString();
    fixtures.push({
      fixture: { id: nextId++, date, timestamp: Date.parse(date) / 1000, venue: { name: `Estadio ${h.name}`, city: 'Testville' }, status: { long: 'Match Finished', short: 'FT', elapsed: 90, extra: null } },
      league: { ...LEAGUE, round: `Regular Season - ${round + 1}` },
      teams: { home: { id: h.id, name: h.name, logo: null }, away: { id: a.id, name: a.name, logo: null } },
      goals: { home: hg, away: ag },
      score: { halftime: { home: Math.min(hg, poisson(0.6)), away: Math.min(ag, poisson(0.45)) } },
    });
  }
}
const upcoming = [
  { id: 600001, home: TEAMS[0], away: TEAMS[5], offset: 2 * DAY + 7 * 3600_000 },
  { id: 600002, home: TEAMS[1], away: TEAMS[2], offset: 2 * DAY + 9 * 3600_000 },
  { id: 600003, home: TEAMS[3], away: TEAMS[4], offset: 3 * DAY + 7 * 3600_000 },
].map((u) => {
  const date = new Date(ANCHOR + u.offset).toISOString();
  return {
    fixture: { id: u.id, date, timestamp: Date.parse(date) / 1000, venue: { name: `Estadio ${u.home.name}`, city: 'Testville' }, status: { long: 'Not Started', short: 'NS', elapsed: null, extra: null } },
    league: { ...LEAGUE, round: 'Regular Season - 31' },
    teams: { home: { id: u.home.id, name: u.home.name, logo: null }, away: { id: u.away.id, name: u.away.name, logo: null } },
    goals: { home: null, away: null },
    score: { halftime: { home: null, away: null } },
  };
});

const envelope = (response, parameters = {}) => ({ get: 'fixtures', parameters, errors: [], results: response.length, paging: { current: 1, total: 1 }, response });
const dir = (p) => path.join(__dirname, p);
const write = (p, data) => fs.writeFileSync(dir(p), JSON.stringify(data, null, 2) + '\n');

write('api-football/fixtures-history.json', envelope(fixtures, { league: '9001', season: '2026' }));
write('api-football/fixtures-upcoming.json', envelope(upcoming, { league: '9001', season: '2026' }));

const live = JSON.parse(JSON.stringify(upcoming[2]));
live.fixture.date = new Date(ANCHOR - 30 * 60_000).toISOString();
live.fixture.status = { long: 'First Half', short: '1H', elapsed: 31, extra: null };
live.goals = { home: 1, away: 0 };
write('api-football/fixtures-live.json', envelope([live], { live: '9001' }));

const finished = JSON.parse(JSON.stringify(upcoming[0]));
finished.fixture.status = { long: 'Match Finished', short: 'FT', elapsed: 90, extra: null };
finished.goals = { home: 2, away: 0 };
finished.score.halftime = { home: 1, away: 0 };
write('api-football/fixture-result.json', envelope([finished], { id: '600001' }));

write('api-football/leagues.json', {
  get: 'leagues',
  parameters: { id: '9001' },
  errors: [],
  results: 1,
  paging: { current: 1, total: 1 },
  response: [{ league: { id: 9001, name: 'Liga de Prueba', type: 'League', logo: null }, country: { name: 'Testland', code: 'TL', flag: null }, seasons: [{ year: 2026, start: '2026-02-01', end: '2026-12-15', current: true }] }],
});
write('api-football/statistics.json', {
  get: 'fixtures/statistics',
  parameters: { fixture: String(fixtures[fixtures.length - 1].fixture.id) },
  errors: [],
  results: 2,
  paging: { current: 1, total: 1 },
  response: [
    { team: { id: fixtures[fixtures.length - 1].teams.home.id, name: 'x' }, statistics: [{ type: 'Shots on Goal', value: 6 }, { type: 'Total Shots', value: 14 }, { type: 'Corner Kicks', value: 7 }, { type: 'Ball Possession', value: '58%' }, { type: 'Yellow Cards', value: 2 }, { type: 'Red Cards', value: null }, { type: 'expected_goals', value: '1.72' }] },
    { team: { id: fixtures[fixtures.length - 1].teams.away.id, name: 'y' }, statistics: [{ type: 'Shots on Goal', value: 2 }, { type: 'Total Shots', value: 8 }, { type: 'Corner Kicks', value: 3 }, { type: 'Ball Possession', value: '42%' }, { type: 'Yellow Cards', value: 3 }, { type: 'Red Cards', value: 1 }, { type: 'expected_goals', value: '0.64' }] },
  ],
});
write('api-football/events.json', {
  get: 'fixtures/events',
  parameters: { fixture: '600003' },
  errors: [],
  results: 2,
  paging: { current: 1, total: 1 },
  response: [
    { time: { elapsed: 12, extra: null }, team: { id: 104, name: 'Unión Delta' }, player: { id: 9, name: 'J. Pruebas' }, assist: { id: 10, name: 'M. Ejemplo' }, type: 'Goal', detail: 'Normal Goal' },
    { time: { elapsed: 27, extra: null }, team: { id: 105, name: 'Real Épsilon' }, player: { id: 21, name: 'L. Ficticio' }, assist: { id: null, name: null }, type: 'Card', detail: 'Yellow Card' },
  ],
});
write('api-football/lineups.json', {
  get: 'fixtures/lineups',
  parameters: { fixture: '600001' },
  errors: [],
  results: 2,
  paging: { current: 1, total: 1 },
  response: [101, 106].map((teamId) => ({
    team: { id: teamId, name: 'x' },
    coach: { id: 1, name: 'Entrenador Ficticio' },
    formation: '4-3-3',
    startXI: Array.from({ length: 11 }, (_, i) => ({ player: { id: teamId * 100 + i, name: `Jugador ${teamId}-${i + 1}`, number: i + 1, pos: i === 0 ? 'G' : i < 5 ? 'D' : i < 8 ? 'M' : 'F' } })),
    substitutes: [{ player: { id: teamId * 100 + 20, name: `Suplente ${teamId}`, number: 20, pos: 'M' } }],
  })),
});
write('api-football/injuries.json', {
  get: 'injuries',
  parameters: { fixture: '600001' },
  errors: [],
  results: 1,
  paging: { current: 1, total: 1 },
  response: [{ player: { id: 777, name: 'K. Lesionado', type: 'Missing Fixture', reason: 'Knee Injury' }, team: { id: 106, name: 'Sporting Zeta' }, fixture: { id: 600001, date: upcoming[0].fixture.date } }],
});
write('api-football/standings.json', {
  get: 'standings',
  parameters: { league: '9001', season: '2026' },
  errors: [],
  results: 1,
  paging: { current: 1, total: 1 },
  response: [
    {
      league: {
        id: 9001,
        season: 2026,
        standings: [
          TEAMS.map((t, i) => ({ rank: i + 1, team: { id: t.id, name: t.name, logo: null }, points: 60 - i * 7, group: 'Liga de Prueba', form: 'WDLWW', all: { played: 30, win: 18 - i * 2, draw: 6, lose: 6 + i * 2, goals: { for: 50 - i * 5, against: 25 + i * 4 } } })),
        ],
      },
    },
  ],
});
write('api-football/error-plan.json', { get: 'odds', parameters: {}, errors: { plan: 'Your plan does not include this endpoint' }, results: 0, paging: { current: 1, total: 1 }, response: [] });

// The Odds API: nombres de equipos con variaciones ("FC", sin tilde) para probar la deduplicación.
const book = (key, title, prices, ts) => ({
  key,
  title,
  last_update: ts,
  markets: [
    { key: 'h2h', last_update: ts, outcomes: [{ name: prices.homeName, price: prices.h }, { name: prices.awayName, price: prices.a }, { name: 'Draw', price: prices.d }] },
    { key: 'totals', last_update: ts, outcomes: [{ name: 'Over', price: prices.o, point: 2.5 }, { name: 'Under', price: prices.u, point: 2.5 }] },
    { key: 'spreads', last_update: ts, outcomes: [{ name: prices.homeName, price: prices.sh, point: -0.5 }, { name: prices.awayName, price: prices.sa, point: 0.5 }] },
  ],
});
const oddsEvent = (id, fx, homeName, awayName, books) => ({
  id,
  sport_key: 'soccer_testland_liga',
  sport_title: 'Liga de Prueba',
  commence_time: fx.fixture.date,
  home_team: homeName,
  away_team: awayName,
  bookmakers: books,
});
const ts1 = new Date(ANCHOR - 10 * 60_000).toISOString();
const ts2 = new Date(ANCHOR - 1 * 60_000).toISOString();
const e1 = (ts, drift) => {
  const p = { homeName: 'Club Alfa FC', awayName: 'Sporting Zeta' };
  return [
    book('casa_uno', 'Casa Uno', { ...p, h: 1.62 + drift, d: 4.0, a: 5.6, o: 1.95, u: 1.88, sh: 1.62 + drift, sa: 2.35 }, ts),
    book('casa_dos', 'Casa Dos', { ...p, h: 1.66, d: 3.9, a: 5.3, o: 2.02, u: 1.82, sh: 1.66, sa: 2.28 }, ts),
    book('casa_tres', 'Casa Tres', { ...p, h: 1.6, d: 4.1, a: 5.8, o: 1.98, u: 1.86, sh: 1.6, sa: 2.4 }, ts),
    book('casa_no_autorizada', 'Casa No Autorizada', { ...p, h: 2.5, d: 4.5, a: 7.0, o: 2.4, u: 2.1, sh: 2.5, sa: 2.6 }, ts),
  ];
};
const e2 = (ts) => {
  const p = { homeName: 'Deportivo Beta', awayName: 'Atletico Gamma' };
  return [
    book('casa_uno', 'Casa Uno', { ...p, h: 2.3, d: 3.3, a: 3.2, o: 2.1, u: 1.75, sh: 2.3, sa: 1.65 }, ts),
    book('casa_dos', 'Casa Dos', { ...p, h: 2.25, d: 3.4, a: 3.25, o: 2.15, u: 1.72, sh: 2.25, sa: 1.68 }, ts),
    // Precios generosos en totals para que exista un arbitraje matemático detectable.
    book('casa_tres', 'Casa Tres', { ...p, h: 2.2, d: 3.35, a: 3.3, o: 2.25, u: 2.3, sh: 2.2, sa: 1.7 }, ts),
  ];
};
write('the-odds-api/odds-1.json', [oddsEvent('ev_alfa_zeta', upcoming[0], 'Club Alfa FC', 'Sporting Zeta', e1(ts1, 0)), oddsEvent('ev_beta_gamma', upcoming[1], 'Deportivo Beta', 'Atletico Gamma', e2(ts1))]);
write('the-odds-api/odds-2.json', [oddsEvent('ev_alfa_zeta', upcoming[0], 'Club Alfa FC', 'Sporting Zeta', e1(ts2, 0.08)), oddsEvent('ev_beta_gamma', upcoming[1], 'Deportivo Beta', 'Atletico Gamma', e2(ts1))]);
write('the-odds-api/scores.json', [{ id: 'ev_alfa_zeta', sport_key: 'soccer_testland_liga', commence_time: upcoming[0].fixture.date, completed: true, home_team: 'Club Alfa FC', away_team: 'Sporting Zeta', scores: [{ name: 'Club Alfa FC', score: '2' }, { name: 'Sporting Zeta', score: '0' }], last_update: ts2 }]);

write('odds-api-io/odds-multi.json', [
  {
    id: 9911,
    home: 'Club Alfa',
    away: 'Sporting Zeta',
    date: upcoming[0].fixture.date,
    status: 'pending',
    league: { name: 'Liga de Prueba', slug: 'testland-liga' },
    bookmakers: {
      'Casa Cuatro': [
        { name: 'ML', odds: [{ home: '1.64', draw: '3.95', away: '5.50' }], updatedAt: ts1 },
        { name: 'Spread', odds: [{ hdp: -0.5, home: '1.64', away: '2.30' }], updatedAt: ts1 },
        { name: 'Totals', odds: [{ max: 2.5, over: '1.97', under: '1.85' }], updatedAt: ts1 },
        { name: 'Both Teams To Score', odds: [{ yes: '1.80', no: '1.95' }], updatedAt: ts1 },
      ],
    },
  },
]);

console.log(`Fixtures: ${fixtures.length} históricos, ${upcoming.length} próximos`);
