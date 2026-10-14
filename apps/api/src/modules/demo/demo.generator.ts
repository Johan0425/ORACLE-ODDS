import type { FixtureStatus } from '@prisma/client';
import { buildScoreMatrix, sumMatrix } from '@oracle-odds/probability-engine';
import type { NormalizedFixture, NormalizedLeague, NormalizedOddsEvent, NormalizedPrice, NormalizedTeam, NormalizedTeamStats } from '../../providers/types';

/**
 * Generador de datos de DEMOSTRACIÓN. Todo es ficticio: ligas, equipos y casas
 * llevan nombres inventados y se marcan con el proveedor DEMO para poder
 * borrarlos sin tocar datos reales. Determinista: misma semilla y mismo día →
 * mismos partidos (re-ejecutar no duplica).
 */

const P = 'DEMO' as const;
const DAY = 86_400_000;

export const DEMO_BOOKMAKERS = [
  { key: 'demo-aurora', name: 'Aurora Bet (demo)', margin: 0.05 },
  { key: 'demo-cumbre', name: 'Cumbre Apuestas (demo)', margin: 0.065 },
  { key: 'demo-delta', name: 'Delta Odds (demo)', margin: 0.045 },
  { key: 'demo-faro', name: 'Faro Sports (demo)', margin: 0.07 },
];

const LEAGUES = [
  {
    id: 'liga-andina',
    name: 'Liga Demo Andina',
    country: 'Demolandia',
    teams: ['Atlético Cóndor', 'Deportivo Jaguar', 'Real Montaña', 'Unión Cafetera', 'Club Río Claro', 'Independiente Sabana', 'Sporting Nevado', 'Juventud Llanera', 'Racing Orquídea', 'Once Valles', 'Atlético Bahía', 'Deportes Páramo'],
  },
  {
    id: 'liga-pacifico',
    name: 'Liga Demo Pacífico',
    country: 'Demolandia',
    teams: ['Marea FC', 'Puerto Azul', 'Coral Unido', 'Delfines del Sur', 'Arrecife CD', 'Brisa Marina', 'Olas Rojas', 'Manglar SC', 'Faro del Norte', 'Ancla Verde', 'Velero City', 'Estrella Costera'],
  },
  {
    id: 'premier-demo',
    name: 'Premier Demo',
    country: 'Ficticia',
    teams: ['Northbridge Rovers', 'Kingsmoor United', 'Ashford Town', 'Redcliffe Athletic', 'Westvale City', 'Hollowmere FC', 'Stonegate Wanderers', 'Brightwater Albion', 'Eastport County', 'Oakhurst Rangers', 'Silverlake Borough', 'Thornfield Villa'],
  },
  {
    id: 'liga-iberica',
    name: 'Liga Demo Ibérica',
    country: 'Ficticia',
    teams: ['Real Olivar', 'Atlético Alcázar', 'CD Sierra Alta', 'Unión Levante Demo', 'Racing Mesón', 'Deportivo Faro', 'Sporting Ribera', 'CF Almenara', 'UD Castillo', 'SD Vega Real', 'Club Brisas', 'Atlético Molinos'],
  },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(r: () => number, l: number): number {
  let k = 0;
  let p = 1;
  const L = Math.exp(-l);
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

interface TeamDef {
  ref: string;
  name: string;
  attack: number;
  defense: number;
}

export interface DemoMatch {
  fixture: NormalizedFixture;
  stats: NormalizedTeamStats[];
  lambdas: { home: number; away: number };
  phase: 'history' | 'recent' | 'live' | 'upcoming';
  finalScore: { home: number; away: number; htHome: number; htAway: number } | null;
}

function teams(leagueIdx: number): TeamDef[] {
  const r = rng(1000 + leagueIdx);
  return LEAGUES[leagueIdx].teams.map((name, i) => ({
    ref: `${LEAGUES[leagueIdx].id}:${i}`,
    name,
    attack: 0.75 + r() * 0.65,
    defense: 0.75 + r() * 0.5,
  }));
}

/** Jornadas de todos contra todos (método del círculo). */
function roundRobin(n: number): Array<Array<[number, number]>> {
  const ids = Array.from({ length: n }, (_, i) => i);
  const rounds: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop()!);
  }
  return [...rounds, ...rounds.map((rd) => rd.map(([a, b]) => [b, a] as [number, number]))];
}

/** Inicio del día actual en Bogotá (UTC−5, sin horario de verano). */
export function demoAnchor(now = new Date()): Date {
  const bogota = new Date(now.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(bogota.getUTCFullYear(), bogota.getUTCMonth(), bogota.getUTCDate()) + 5 * 3600_000);
}

/**
 * Calendario: 40 jornadas pasadas (historial), 1 jornada reciente (ayer, para
 * liquidar), partidos en vivo ahora y 5 jornadas próximas (~100+ partidos).
 */
export function generateDemoSeason(now = new Date(), anchorDate: Date = demoAnchor(now)): DemoMatch[] {
  const anchor = anchorDate.getTime();
  const out: DemoMatch[] = [];
  LEAGUES.forEach((league, li) => {
    const ts = teams(li);
    const schedule = roundRobin(ts.length);
    const leagueN: NormalizedLeague = {
      ref: { provider: P, externalId: league.id },
      sport: 'FOOTBALL',
      name: league.name,
      country: { code: null, name: league.country },
      type: 'league',
      season: { label: '2026', year: 2026, current: true },
    };
    const team = (t: TeamDef): NormalizedTeam => ({ ref: { provider: P, externalId: t.ref }, sport: 'FOOTBALL', name: t.name, venueName: `Estadio ${t.name}` });
    // Rondas: 0..39 historial (semanal), 40 reciente, 41 en vivo (2 partidos), 42..46 próximas.
    for (let round = 0; round < 47; round++) {
      const pairs = schedule[round % schedule.length];
      const r = rng(li * 10_000 + round * 100 + 7);
      pairs.forEach(([hi, ai], k) => {
        const h = ts[hi];
        const a = ts[ai];
        let phase: DemoMatch['phase'];
        let kickoff: number;
        const slotHour = [13, 15, 17, 19, 20, 21][k % 6];
        if (round < 40) {
          phase = 'history';
          kickoff = anchor - (41 - round) * 7 * DAY + slotHour * 3600_000 + li * 900_000;
        } else if (round === 40) {
          phase = 'recent';
          kickoff = anchor - DAY + slotHour * 3600_000 + li * 900_000;
        } else if (round === 41) {
          if (k > 0 || li > 1) return; // solo 2 partidos en vivo en total
          phase = 'live';
          kickoff = now.getTime() - (35 + li * 25) * 60_000;
        } else {
          phase = 'upcoming';
          kickoff = anchor + (round - 41) * 2 * DAY + slotHour * 3600_000 + li * 1_800_000;
          if (kickoff <= now.getTime() + 30 * 60_000) kickoff += DAY;
        }
        const lambdas = { home: 1.42 * h.attack * a.defense, away: 1.08 * a.attack * h.defense };
        let status: FixtureStatus = 'SCHEDULED';
        let finalScore: DemoMatch['finalScore'] = null;
        let homeScore: number | null = null;
        let awayScore: number | null = null;
        let elapsed: number | null = null;
        let htH: number | null = null;
        let htA: number | null = null;
        {
          // Marcador final pre-simulado (determinista); solo se aplica cuando el partido ya "se jugó".
          const hg = poisson(r, lambdas.home);
          const ag = poisson(r, lambdas.away);
          htH = Math.min(hg, poisson(r, lambdas.home * 0.45));
          htA = Math.min(ag, poisson(r, lambdas.away * 0.45));
          finalScore = { home: hg, away: ag, htHome: htH, htAway: htA };
        }
        if (phase === 'history' || phase === 'recent') {
          if (phase === 'history') {
            status = 'FINISHED';
            homeScore = finalScore.home;
            awayScore = finalScore.away;
          }
        } else if (phase === 'live') {
          status = 'LIVE';
          elapsed = Math.round((now.getTime() - kickoff) / 60_000);
          homeScore = Math.min(finalScore!.home, poisson(r, lambdas.home * (elapsed / 90)));
          awayScore = Math.min(finalScore!.away, poisson(r, lambdas.away * (elapsed / 90)));
        }
        const extId = `${league.id}:r${round}:${hi}-${ai}`;
        const fixture: NormalizedFixture = {
          ref: { provider: P, externalId: extId },
          sport: 'FOOTBALL',
          league: leagueN,
          home: team(h),
          away: team(a),
          kickoff: new Date(kickoff),
          status,
          statusDetail: status === 'LIVE' ? (elapsed! > 45 ? '2H' : '1H') : status === 'FINISHED' ? 'FT' : 'NS',
          elapsedMinutes: elapsed,
          period: status === 'LIVE' ? (elapsed! > 45 ? '2H' : '1H') : null,
          venue: `Estadio ${h.name}, ${league.country}`,
          round: `Jornada ${round + 1}`,
          homeScore,
          awayScore,
          htHomeScore: status === 'FINISHED' ? htH : null,
          htAwayScore: status === 'FINISHED' ? htA : null,
          sourceTimestamp: now,
        };
        const stats: NormalizedTeamStats[] =
          phase === 'history'
            ? [h, a].map((t, side) => ({
                fixtureRef: fixture.ref,
                teamRef: { provider: P, externalId: t.ref },
                corners: 2 + poisson(r, side === 0 ? 3.6 * t.attack : 3.0 * t.attack),
                yellowCards: poisson(r, 1.9),
                redCards: r() < 0.06 ? 1 : 0,
                shotsOnGoal: 1 + poisson(r, 3.5 * t.attack),
                shotsTotal: 5 + poisson(r, 7 * t.attack),
                possession: null,
                expectedGoals: null,
                raw: { demo: true },
              }))
            : [];
        out.push({ fixture, stats, lambdas, phase, finalScore });
      });
    }
  });
  return out;
}

/** Cuotas ficticias de 4 casas a partir de las probabilidades "verdaderas" del generador con margen y ruido por casa. */
export function demoOdds(m: DemoMatch, capturedAt: Date, seed: number): NormalizedOddsEvent {
  const matrix = buildScoreMatrix(m.lambdas.home, m.lambdas.away);
  const p1x2 = [sumMatrix(matrix, (h, a) => h > a), sumMatrix(matrix, (h, a) => h === a), sumMatrix(matrix, (h, a) => h < a)];
  const pOver = sumMatrix(matrix, (h, a) => h + a > 2.5);
  // AH −0.5 para el local: gana si h − 0.5 − a > 0, es decir, si el local gana.
  const pAhHome = sumMatrix(matrix, (h, a) => h - a > 0.5);
  const pBtts = sumMatrix(matrix, (h, a) => h > 0 && a > 0);
  const prices: NormalizedPrice[] = [];
  DEMO_BOOKMAKERS.forEach((b, bi) => {
    const r = rng(seed * 31 + bi);
    const book = (probs: number[]) => {
      const noisy = probs.map((p) => Math.max(0.02, p * (1 + (r() - 0.5) * 0.12)));
      const sum = noisy.reduce((s, x) => s + x, 0);
      return noisy.map((p) => Math.max(1.02, Math.round((1 / ((p / sum) * (1 + b.margin))) * 100) / 100));
    };
    const add = (marketKey: string, keys: string[], line: number | null, probs: number[]) =>
      book(probs).forEach((price, i) =>
        prices.push({ bookmaker: { key: b.key, name: b.name }, marketKey, selectionKey: keys[i], line, priceDecimal: price, isLive: false, isSuspended: false, sourceTimestamp: capturedAt }),
      );
    add('1X2', ['HOME', 'DRAW', 'AWAY'], null, p1x2);
    add('OU_GOALS', ['OVER', 'UNDER'], 2.5, [pOver, 1 - pOver]);
    add('AH', ['HOME', 'AWAY'], -0.5, [pAhHome, 1 - pAhHome]);
    if (bi < 2) add('BTTS', ['YES', 'NO'], null, [pBtts, 1 - pBtts]);
  });
  return {
    ref: { provider: P, externalId: `odds:${m.fixture.ref.externalId}` },
    sport: 'FOOTBALL',
    competitionKey: m.fixture.league.ref.externalId,
    competitionName: m.fixture.league.name,
    homeTeamName: m.fixture.home.name,
    awayTeamName: m.fixture.away.name,
    kickoff: m.fixture.kickoff,
    fixtureRef: m.fixture.ref,
    prices,
  };
}

