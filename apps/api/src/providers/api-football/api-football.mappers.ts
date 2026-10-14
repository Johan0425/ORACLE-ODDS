import type { FixtureStatus } from '@prisma/client';
import { z } from 'zod';
import type {
  NormalizedEvent,
  NormalizedFixture,
  NormalizedInjury,
  NormalizedLeague,
  NormalizedLineup,
  NormalizedOddsEvent,
  NormalizedPrice,
  NormalizedStanding,
  NormalizedTeam,
  NormalizedTeamStats,
} from '../types';

const P = 'API_FOOTBALL' as const;
const ref = (id: number | string) => ({ provider: P, externalId: String(id) });

export const envelopeSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.unknown())]).optional(),
  results: z.number().optional(),
  paging: z.object({ current: z.number(), total: z.number() }).optional(),
  response: z.array(z.unknown()),
});

const nullableNum = z.number().nullable().optional();

const fixtureItem = z.object({
  fixture: z.object({
    id: z.number(),
    date: z.string(),
    timestamp: z.number().optional(),
    venue: z.object({ name: z.string().nullable().optional(), city: z.string().nullable().optional() }).partial().nullable().optional(),
    status: z.object({ short: z.string(), long: z.string().optional(), elapsed: nullableNum, extra: nullableNum }),
  }),
  league: z.object({
    id: z.number(),
    name: z.string(),
    country: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    flag: z.string().nullable().optional(),
    season: z.number().nullable().optional(),
    round: z.string().nullable().optional(),
  }),
  teams: z.object({
    home: z.object({ id: z.number(), name: z.string(), logo: z.string().nullable().optional() }),
    away: z.object({ id: z.number(), name: z.string(), logo: z.string().nullable().optional() }),
  }),
  goals: z.object({ home: nullableNum, away: nullableNum }),
  score: z
    .object({ halftime: z.object({ home: nullableNum, away: nullableNum }).optional() })
    .partial()
    .optional(),
});

/** Estados de API-Football → estado canónico. Ver docs/data-providers.md. */
export function mapStatus(short: string): { status: FixtureStatus; period: string | null } {
  switch (short) {
    case 'TBD':
    case 'NS':
      return { status: 'SCHEDULED', period: null };
    case '1H':
      return { status: 'LIVE', period: '1H' };
    case 'HT':
      return { status: 'LIVE', period: 'HT' };
    case '2H':
      return { status: 'LIVE', period: '2H' };
    case 'ET':
    case 'BT':
      return { status: 'LIVE', period: 'ET' };
    case 'P':
      return { status: 'LIVE', period: 'P' };
    case 'LIVE':
      return { status: 'LIVE', period: null };
    case 'SUSP':
    case 'INT':
      return { status: 'SUSPENDED', period: null };
    case 'FT':
    case 'AET':
    case 'PEN':
      return { status: 'FINISHED', period: 'FT' };
    case 'PST':
      return { status: 'POSTPONED', period: null };
    case 'CANC':
      return { status: 'CANCELLED', period: null };
    case 'ABD':
      return { status: 'ABANDONED', period: null };
    case 'AWD':
    case 'WO':
      // Resultado administrativo: no es un marcador deportivo; no se liquida como tal.
      return { status: 'CANCELLED', period: null };
    default:
      return { status: 'SCHEDULED', period: null };
  }
}

function leagueFrom(l: z.infer<typeof fixtureItem>['league']): NormalizedLeague {
  return {
    ref: ref(l.id),
    sport: 'FOOTBALL',
    name: l.name,
    country: l.country ? { code: null, name: l.country, flagUrl: l.flag ?? null } : null,
    logoUrl: l.logo ?? null,
    season: l.season != null ? { label: String(l.season), year: l.season } : null,
  };
}

function teamFrom(t: { id: number; name: string; logo?: string | null }): NormalizedTeam {
  return { ref: ref(t.id), sport: 'FOOTBALL', name: t.name, logoUrl: t.logo ?? null };
}

export function mapFixtures(items: unknown[]): { fixtures: NormalizedFixture[]; rejected: number } {
  const fixtures: NormalizedFixture[] = [];
  let rejected = 0;
  for (const raw of items) {
    const parsed = fixtureItem.safeParse(raw);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }
    const f = parsed.data;
    const { status, period } = mapStatus(f.fixture.status.short);
    const hasScore = status !== 'SCHEDULED' && status !== 'POSTPONED' && status !== 'CANCELLED';
    fixtures.push({
      ref: ref(f.fixture.id),
      sport: 'FOOTBALL',
      league: leagueFrom(f.league),
      home: teamFrom(f.teams.home),
      away: teamFrom(f.teams.away),
      kickoff: new Date(f.fixture.date),
      status,
      statusDetail: f.fixture.status.short,
      elapsedMinutes: f.fixture.status.elapsed ?? null,
      period,
      venue: [f.fixture.venue?.name, f.fixture.venue?.city].filter(Boolean).join(', ') || null,
      round: f.league.round ?? null,
      homeScore: hasScore ? (f.goals.home ?? null) : null,
      awayScore: hasScore ? (f.goals.away ?? null) : null,
      htHomeScore: f.score?.halftime?.home ?? null,
      htAwayScore: f.score?.halftime?.away ?? null,
      sourceTimestamp: new Date(),
    });
  }
  return { fixtures, rejected };
}

const leagueItem = z.object({
  league: z.object({ id: z.number(), name: z.string(), type: z.string().optional(), logo: z.string().nullable().optional() }),
  country: z.object({ name: z.string(), code: z.string().nullable().optional(), flag: z.string().nullable().optional() }).optional(),
  seasons: z
    .array(z.object({ year: z.number(), start: z.string().optional(), end: z.string().optional(), current: z.boolean().optional() }))
    .optional(),
});

export function mapLeagues(items: unknown[]): NormalizedLeague[] {
  return items.flatMap((raw) => {
    const p = leagueItem.safeParse(raw);
    if (!p.success) return [];
    const current = p.data.seasons?.find((s) => s.current) ?? p.data.seasons?.[p.data.seasons.length - 1];
    return [
      {
        ref: ref(p.data.league.id),
        sport: 'FOOTBALL' as const,
        name: p.data.league.name,
        type: p.data.league.type?.toLowerCase() ?? null,
        logoUrl: p.data.league.logo ?? null,
        country: p.data.country ? { code: p.data.country.code ?? null, name: p.data.country.name, flagUrl: p.data.country.flag ?? null } : null,
        season: current
          ? {
              label: String(current.year),
              year: current.year,
              start: current.start ? new Date(current.start) : null,
              end: current.end ? new Date(current.end) : null,
              current: !!current.current,
            }
          : null,
      },
    ];
  });
}

const teamItem = z.object({
  team: z.object({ id: z.number(), name: z.string(), code: z.string().nullable().optional(), country: z.string().nullable().optional(), logo: z.string().nullable().optional() }),
  venue: z.object({ name: z.string().nullable().optional() }).partial().optional(),
});

export function mapTeams(items: unknown[]): NormalizedTeam[] {
  return items.flatMap((raw) => {
    const p = teamItem.safeParse(raw);
    if (!p.success) return [];
    return [
      {
        ref: ref(p.data.team.id),
        sport: 'FOOTBALL' as const,
        name: p.data.team.name,
        shortName: p.data.team.code ?? null,
        country: p.data.team.country ?? null,
        logoUrl: p.data.team.logo ?? null,
        venueName: p.data.venue?.name ?? null,
      },
    ];
  });
}

const STAT_KEYS: Record<string, keyof Omit<NormalizedTeamStats, 'fixtureRef' | 'teamRef' | 'raw'>> = {
  'Corner Kicks': 'corners',
  'Yellow Cards': 'yellowCards',
  'Red Cards': 'redCards',
  'Shots on Goal': 'shotsOnGoal',
  'Total Shots': 'shotsTotal',
  'Ball Possession': 'possession',
  expected_goals: 'expectedGoals',
};

const statsItem = z.object({
  team: z.object({ id: z.number() }),
  statistics: z.array(z.object({ type: z.string(), value: z.union([z.number(), z.string(), z.null()]) })),
});

function parseStatValue(v: number | string | null): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(v.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

export function mapStatistics(fixtureId: string, items: unknown[]): NormalizedTeamStats[] {
  return items.flatMap((raw) => {
    const p = statsItem.safeParse(raw);
    if (!p.success) return [];
    const out: NormalizedTeamStats = { fixtureRef: ref(fixtureId), teamRef: ref(p.data.team.id), raw: {} };
    for (const s of p.data.statistics) {
      out.raw[s.type] = s.value;
      const key = STAT_KEYS[s.type];
      if (key) (out as unknown as Record<string, number | null>)[key] = parseStatValue(s.value);
    }
    // Ausencia de tarjetas en la respuesta = null, no 0: el proveedor no siempre las reporta.
    return [out];
  });
}

const eventItem = z.object({
  time: z.object({ elapsed: z.number(), extra: z.number().nullable().optional() }),
  team: z.object({ id: z.number().nullable().optional() }).optional(),
  player: z.object({ name: z.string().nullable().optional() }).partial().optional(),
  assist: z.object({ name: z.string().nullable().optional() }).partial().optional(),
  type: z.string(),
  detail: z.string().nullable().optional(),
});

export function mapEvents(fixtureId: string, items: unknown[]): NormalizedEvent[] {
  return items.flatMap((raw) => {
    const p = eventItem.safeParse(raw);
    if (!p.success) return [];
    return [
      {
        fixtureRef: ref(fixtureId),
        teamRef: p.data.team?.id != null ? ref(p.data.team.id) : null,
        minute: p.data.time.elapsed,
        extraMinute: p.data.time.extra ?? null,
        type: p.data.type,
        detail: p.data.detail ?? null,
        playerName: p.data.player?.name ?? null,
        assistName: p.data.assist?.name ?? null,
      },
    ];
  });
}

const lineupPlayer = z.object({
  player: z.object({ id: z.number().nullable().optional(), name: z.string(), number: z.number().nullable().optional(), pos: z.string().nullable().optional() }),
});
const lineupItem = z.object({
  team: z.object({ id: z.number() }),
  coach: z.object({ name: z.string().nullable().optional() }).partial().nullable().optional(),
  formation: z.string().nullable().optional(),
  startXI: z.array(lineupPlayer).default([]),
  substitutes: z.array(lineupPlayer).default([]),
});

export function mapLineups(fixtureId: string, items: unknown[]): NormalizedLineup[] {
  const player = (p: z.infer<typeof lineupPlayer>) => ({
    name: p.player.name,
    number: p.player.number ?? null,
    position: p.player.pos ?? null,
    externalId: p.player.id != null ? String(p.player.id) : null,
  });
  return items.flatMap((raw) => {
    const p = lineupItem.safeParse(raw);
    if (!p.success) return [];
    return [
      {
        fixtureRef: ref(fixtureId),
        teamRef: ref(p.data.team.id),
        formation: p.data.formation ?? null,
        coach: p.data.coach?.name ?? null,
        startXI: p.data.startXI.map(player),
        substitutes: p.data.substitutes.map(player),
      },
    ];
  });
}

const injuryItem = z.object({
  player: z.object({ id: z.number(), name: z.string(), type: z.string().nullable().optional(), reason: z.string().nullable().optional() }),
  team: z.object({ id: z.number() }),
  fixture: z.object({ id: z.number() }).optional(),
});

export function mapInjuries(items: unknown[]): NormalizedInjury[] {
  return items.flatMap((raw) => {
    const p = injuryItem.safeParse(raw);
    if (!p.success) return [];
    const type = (p.data.player.type ?? '').toLowerCase();
    return [
      {
        fixtureRef: p.data.fixture ? ref(p.data.fixture.id) : null,
        teamRef: ref(p.data.team.id),
        playerRef: ref(p.data.player.id),
        playerName: p.data.player.name,
        status: type.includes('missing') ? 'out' : type.includes('question') || type.includes('doubt') ? 'doubtful' : type || 'unknown',
        reason: p.data.player.reason ?? null,
      },
    ];
  });
}

const standingRow = z.object({
  rank: z.number(),
  team: z.object({ id: z.number(), name: z.string(), logo: z.string().nullable().optional() }),
  points: z.number(),
  group: z.string().nullable().optional(),
  form: z.string().nullable().optional(),
  all: z.object({
    played: z.number(),
    win: z.number(),
    draw: z.number(),
    lose: z.number(),
    goals: z.object({ for: z.number(), against: z.number() }),
  }),
});
const standingsItem = z.object({
  league: z.object({ id: z.number(), season: z.number(), standings: z.array(z.array(z.unknown())) }),
});

export function mapStandings(items: unknown[]): NormalizedStanding[] {
  return items.flatMap((raw) => {
    const p = standingsItem.safeParse(raw);
    if (!p.success) return [];
    return p.data.league.standings.flat().flatMap((row) => {
      const r = standingRow.safeParse(row);
      if (!r.success) return [];
      return [
        {
          leagueRef: ref(p.data.league.id),
          season: String(p.data.league.season),
          group: r.data.group ?? null,
          team: teamFrom(r.data.team),
          rank: r.data.rank,
          points: r.data.points,
          played: r.data.all.played,
          won: r.data.all.win,
          drawn: r.data.all.draw,
          lost: r.data.all.lose,
          goalsFor: r.data.all.goals.for,
          goalsAgainst: r.data.all.goals.against,
          form: r.data.form ?? null,
        },
      ];
    });
  });
}

/** Nombres de apuesta de API-Football → mercado canónico. */
const BET_NAME_MAP: Record<string, string> = {
  'match winner': '1X2',
  'home/away': 'ML',
  'double chance': 'DC',
  'goals over/under': 'OU_GOALS',
  'both teams score': 'BTTS',
  'asian handicap': 'AH',
  'handicap result': 'EH',
  'exact score': 'CS',
  'corners over under': 'OU_CORNERS',
  'cards over/under': 'OU_CARDS',
  'first half winner': '1X2_H1',
  'goals over/under first half': 'OU_GOALS_H1',
};

function parseSelection(marketKey: string, value: string): { selectionKey: string; line: number | null } | null {
  const v = value.trim();
  const lower = v.toLowerCase();
  switch (marketKey) {
    case '1X2':
    case '1X2_H1':
    case 'ML':
      return lower === 'home' ? { selectionKey: 'HOME', line: null } : lower === 'draw' ? { selectionKey: 'DRAW', line: null } : lower === 'away' ? { selectionKey: 'AWAY', line: null } : null;
    case 'DC': {
      const map: Record<string, string> = { 'home/draw': 'HOME_DRAW', 'home/away': 'HOME_AWAY', 'draw/away': 'DRAW_AWAY' };
      return map[lower] ? { selectionKey: map[lower], line: null } : null;
    }
    case 'BTTS':
      return lower === 'yes' ? { selectionKey: 'YES', line: null } : lower === 'no' ? { selectionKey: 'NO', line: null } : null;
    case 'OU_GOALS':
    case 'OU_GOALS_H1':
    case 'OU_CORNERS':
    case 'OU_CARDS': {
      const m = /^(over|under)\s+([\d.]+)$/i.exec(v);
      return m ? { selectionKey: m[1].toUpperCase(), line: Number(m[2]) } : null;
    }
    case 'AH':
    case 'EH': {
      const m = /^(home|away|draw)\s*([+-]?[\d.]+)$/i.exec(v);
      if (!m) return null;
      const side = m[1].toUpperCase();
      const n = Number(m[2]);
      // Línea canónica siempre desde la perspectiva del local.
      return { selectionKey: side, line: side === 'AWAY' ? -n : n };
    }
    case 'CS': {
      const m = /^(\d+):(\d+)$/.exec(v);
      return m ? { selectionKey: `${m[1]}-${m[2]}`, line: null } : null;
    }
    default:
      return null;
  }
}

const oddsItem = z.object({
  fixture: z.object({ id: z.number() }),
  update: z.string().optional(),
  bookmakers: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      bets: z.array(z.object({ name: z.string(), values: z.array(z.object({ value: z.union([z.string(), z.number()]), odd: z.string() })) })),
    }),
  ),
});

/** Cuotas prepartido de API-Football (plan que las incluya). El partido ya es referencia directa. */
export function mapOdds(items: unknown[]): NormalizedOddsEvent[] {
  return items.flatMap((raw) => {
    const p = oddsItem.safeParse(raw);
    if (!p.success) return [];
    const ts = p.data.update ? new Date(p.data.update) : new Date();
    const prices: NormalizedPrice[] = [];
    for (const b of p.data.bookmakers) {
      for (const bet of b.bets) {
        const marketKey = BET_NAME_MAP[bet.name.toLowerCase()];
        if (!marketKey) continue;
        for (const val of bet.values) {
          const sel = parseSelection(marketKey, String(val.value));
          const price = Number(val.odd);
          if (!sel || !(price > 1)) continue;
          prices.push({
            bookmaker: { key: slugify(b.name), name: b.name },
            marketKey,
            selectionKey: sel.selectionKey,
            line: sel.line,
            priceDecimal: price,
            isLive: false,
            isSuspended: false,
            sourceTimestamp: ts,
          });
        }
      }
    }
    return [
      {
        ref: ref(p.data.fixture.id),
        sport: 'FOOTBALL' as const,
        competitionKey: 'api-football',
        homeTeamName: '',
        awayTeamName: '',
        kickoff: ts,
        fixtureRef: ref(p.data.fixture.id),
        prices,
      },
    ];
  });
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
