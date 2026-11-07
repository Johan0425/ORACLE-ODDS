import type { FixtureStatus } from '@prisma/client';
import { z } from 'zod';
import { americanToDecimal } from '@oracle-odds/probability-engine';
import type { NormalizedFixture, NormalizedLeague, NormalizedOddsEvent, NormalizedPrice, NormalizedStanding, NormalizedTeam } from '../types';

const P = 'ESPN' as const;
const ref = (id: string) => ({ provider: P, externalId: id });

/**
 * Metadatos de referencia (nombre en español y país) de las ligas ESPN más
 * usadas. No son datos de partidos: una liga no listada usa el nombre que
 * entrega ESPN.
 */
export const ESPN_LEAGUE_META: Record<string, { name: string; country: string; code: string }> = {
  'col.1': { name: 'Liga BetPlay', country: 'Colombia', code: 'CO' },
  'col.copa': { name: 'Copa Colombia', country: 'Colombia', code: 'CO' },
  'conmebol.libertadores': { name: 'Copa Libertadores', country: 'Sudamérica', code: 'CONMEBOL' },
  'conmebol.sudamericana': { name: 'Copa Sudamericana', country: 'Sudamérica', code: 'CONMEBOL' },
  'eng.1': { name: 'Premier League', country: 'Inglaterra', code: 'GB-ENG' },
  'eng.2': { name: 'Championship', country: 'Inglaterra', code: 'GB-ENG' },
  'esp.1': { name: 'LaLiga', country: 'España', code: 'ES' },
  'ita.1': { name: 'Serie A', country: 'Italia', code: 'IT' },
  'ger.1': { name: 'Bundesliga', country: 'Alemania', code: 'DE' },
  'fra.1': { name: 'Ligue 1', country: 'Francia', code: 'FR' },
  'por.1': { name: 'Primeira Liga', country: 'Portugal', code: 'PT' },
  'ned.1': { name: 'Eredivisie', country: 'Países Bajos', code: 'NL' },
  'tur.1': { name: 'Süper Lig', country: 'Turquía', code: 'TR' },
  'bel.1': { name: 'Pro League', country: 'Bélgica', code: 'BE' },
  'sco.1': { name: 'Scottish Premiership', country: 'Escocia', code: 'GB-SCT' },
  'uefa.champions': { name: 'Champions League', country: 'Europa', code: 'UEFA' },
  'uefa.europa': { name: 'Europa League', country: 'Europa', code: 'UEFA' },
  'uefa.europa.conf': { name: 'Conference League', country: 'Europa', code: 'UEFA' },
  'arg.1': { name: 'Liga Profesional', country: 'Argentina', code: 'AR' },
  'bra.1': { name: 'Brasileirão Serie A', country: 'Brasil', code: 'BR' },
  'mex.1': { name: 'Liga MX', country: 'México', code: 'MX' },
  'usa.1': { name: 'MLS', country: 'Estados Unidos', code: 'US' },
  'ecu.1': { name: 'LigaPro', country: 'Ecuador', code: 'EC' },
  'per.1': { name: 'Liga 1 de Perú', country: 'Perú', code: 'PE' },
  'chi.1': { name: 'Primera División de Chile', country: 'Chile', code: 'CL' },
  'uru.1': { name: 'Primera División de Uruguay', country: 'Uruguay', code: 'UY' },
  'par.1': { name: 'Primera División de Paraguay', country: 'Paraguay', code: 'PY' },
  'ven.1': { name: 'Liga FUTVE', country: 'Venezuela', code: 'VE' },
  'bol.1': { name: 'División Profesional de Bolivia', country: 'Bolivia', code: 'BO' },
  'fifa.friendly': { name: 'Amistosos internacionales', country: 'Mundo', code: 'WORLD' },
  'fifa.world': { name: 'Copa del Mundo', country: 'Mundo', code: 'WORLD' },
};

/** Ligas sincronizadas si ESPN_LEAGUES está vacío: Colombia, Sudamérica y las principales de Europa y América. */
export const DEFAULT_ESPN_LEAGUES = [
  'col.1',
  'col.copa',
  'conmebol.libertadores',
  'conmebol.sudamericana',
  'eng.1',
  'esp.1',
  'ita.1',
  'ger.1',
  'fra.1',
  'uefa.champions',
  'uefa.europa',
  'uefa.europa.conf',
  'por.1',
  'ned.1',
  'eng.2',
  'arg.1',
  'bra.1',
  'mex.1',
  'usa.1',
  'ecu.1',
];

const linkless = z.object({}).passthrough();

const oddsQuote = z.object({ odds: z.union([z.string(), z.number()]).nullish(), line: z.union([z.string(), z.number()]).nullish() }).partial();
const openClose = z.object({ open: oddsQuote.nullish(), close: oddsQuote.nullish() }).partial();

const oddsSchema = z
  .object({
    provider: z.object({ id: z.string().optional(), name: z.string() }).partial().optional(),
    overUnder: z.number().nullable().optional(),
    moneyline: z.object({ home: openClose.optional(), away: openClose.optional(), draw: openClose.optional() }).partial().optional(),
    total: z.object({ over: openClose.optional(), under: openClose.optional() }).partial().optional(),
    pointSpread: z.object({ home: openClose.optional(), away: openClose.optional() }).partial().optional(),
  })
  .passthrough();

const competitor = z.object({
  homeAway: z.enum(['home', 'away']),
  score: z.union([z.string(), z.number()]).nullable().optional(),
  linescores: z.array(z.object({ value: z.number().nullish() }).passthrough()).nullish(),
  team: z.object({
    id: z.string(),
    displayName: z.string(),
    shortDisplayName: z.string().nullish(),
    abbreviation: z.string().nullish(),
    logo: z.string().nullish(),
  }).passthrough(),
});

export const eventSchema = z.object({
  id: z.string(),
  date: z.string(),
  season: z.object({ year: z.number(), slug: z.string().nullish() }).partial().nullish(),
  status: z.object({
    displayClock: z.string().nullish(),
    period: z.number().nullish(),
    type: z.object({ name: z.string(), state: z.string(), completed: z.boolean(), shortDetail: z.string().nullish() }),
  }),
  competitions: z
    .array(
      z.object({
        venue: z.object({ fullName: z.string().nullish() }).partial().nullish(),
        competitors: z.array(competitor),
        odds: z.array(oddsSchema.nullable()).nullish(),
        notes: z.array(linkless).nullish(),
      }).passthrough(),
    )
    .min(1),
});

export const scoreboardSchema = z.object({
  leagues: z
    .array(
      z.object({
        name: z.string(),
        abbreviation: z.string().optional(),
        logos: z.array(z.object({ href: z.string() }).passthrough()).optional(),
        season: z.object({ year: z.number().optional(), displayName: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional() }).partial().optional(),
      }).passthrough(),
    )
    .optional(),
  events: z.array(z.unknown()).default([]),
});

export type EspnScoreboard = z.infer<typeof scoreboardSchema>;

/** Estados ESPN → estado canónico. */
export function mapEspnStatus(name: string, state: string): FixtureStatus {
  if (name.includes('POSTPONED') || name.includes('DELAYED') || name.includes('RESCHEDULED') || name === 'STATUS_TBD') return 'POSTPONED';
  if (name.includes('CANCELED') || name.includes('CANCELLED') || name.includes('FORFEIT')) return 'CANCELLED';
  if (name.includes('ABANDONED')) return 'ABANDONED';
  if (name.includes('SUSPENDED')) return 'SUSPENDED';
  if (state === 'in') return 'LIVE';
  if (state === 'post') return 'FINISHED';
  return 'SCHEDULED';
}

const periodOf = (name: string, period?: number | null): string | null => {
  if (name === 'STATUS_HALFTIME') return 'HT';
  if (name.includes('EXTRA') || name.includes('OVERTIME')) return 'ET';
  if (name.includes('SHOOTOUT') || name.includes('PENALT')) return 'P';
  if (period === 1) return '1H';
  if (period === 2) return '2H';
  return null;
};

const toInt = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export function espnLeague(slug: string, sb: EspnScoreboard | null, seasonYear?: number | null): NormalizedLeague {
  const meta = ESPN_LEAGUE_META[slug];
  const l = sb?.leagues?.[0];
  const currentYear = l?.season?.year ?? null;
  const year = seasonYear ?? currentYear;
  return {
    ref: ref(slug),
    sport: 'FOOTBALL',
    name: meta?.name ?? l?.name ?? slug,
    country: meta ? { code: meta.code, name: meta.country } : null,
    logoUrl: l?.logos?.[0]?.href ?? null,
    season: year != null ? { label: String(year), year, current: currentYear != null && year === currentYear } : null,
  };
}

function team(c: z.infer<typeof competitor>): NormalizedTeam {
  return {
    ref: ref(c.team.id),
    sport: 'FOOTBALL',
    name: c.team.displayName,
    shortName: c.team.abbreviation ?? c.team.shortDisplayName ?? null,
    logoUrl: c.team.logo ?? null,
  };
}

/** Cuota americana en texto ("+235", "-105", "EVEN") a decimal; null si no es interpretable. */
export function parseAmerican(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'EVEN' || s === 'EV') return 2;
  const n = Number(s.replace('+', ''));
  if (!Number.isFinite(n) || Math.abs(n) < 100) return null;
  const d = americanToDecimal(n);
  return d > 1.0001 ? Math.round(d * 1000) / 1000 : null;
}

const parseLine = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/^[ou]/i, '').replace('+', ''));
  return Number.isFinite(n) ? n : null;
};

function mapPrices(o: z.infer<typeof oddsSchema>, at: Date): NormalizedPrice[] {
  const name = o.provider?.name ?? 'ESPN BET';
  const bookmaker = { key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name };
  const out: NormalizedPrice[] = [];
  const push = (marketKey: string, selectionKey: string, line: number | null, q: z.infer<typeof openClose> | undefined) => {
    const price = parseAmerican(q?.close?.odds ?? q?.open?.odds);
    if (price) out.push({ bookmaker, marketKey, selectionKey, line, priceDecimal: price, isLive: false, isSuspended: false, sourceTimestamp: at });
  };
  push('1X2', 'HOME', null, o.moneyline?.home);
  push('1X2', 'DRAW', null, o.moneyline?.draw);
  push('1X2', 'AWAY', null, o.moneyline?.away);
  const total = parseLine(o.total?.over?.close?.line ?? o.total?.over?.open?.line) ?? o.overUnder ?? null;
  if (total != null) {
    push('OU_GOALS', 'OVER', total, o.total?.over);
    push('OU_GOALS', 'UNDER', total, o.total?.under);
  }
  // Hándicap: línea expresada desde el local para ambas selecciones (convención del motor).
  const spread = parseLine(o.pointSpread?.home?.close?.line ?? o.pointSpread?.home?.open?.line);
  if (spread != null) {
    push('AH', 'HOME', spread, o.pointSpread?.home);
    push('AH', 'AWAY', spread, o.pointSpread?.away);
  }
  return out;
}

export interface EspnMapped {
  fixtures: NormalizedFixture[];
  odds: NormalizedOddsEvent[];
}

/** Convierte un scoreboard ESPN en partidos normalizados y, solo para partidos no iniciados, cuotas de referencia. */
export function mapScoreboard(slug: string, raw: unknown, fetchedAt = new Date()): EspnMapped {
  const sb = scoreboardSchema.parse(raw);
  const out: EspnMapped = { fixtures: [], odds: [] };
  for (const item of sb.events) {
    const parsed = eventSchema.safeParse(item);
    if (!parsed.success) continue;
    const e = parsed.data;
    const comp = e.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;
    const status = mapEspnStatus(e.status.type.name, e.status.type.state);
    const started = status === 'LIVE' || status === 'FINISHED' || status === 'SUSPENDED' || status === 'ABANDONED';
    const minute = toInt(e.status.displayClock?.replace(/'.*$/, ''));
    const fixture: NormalizedFixture = {
      ref: ref(e.id),
      sport: 'FOOTBALL',
      league: espnLeague(slug, sb, e.season?.year ?? null),
      home: team(home),
      away: team(away),
      kickoff: new Date(e.date),
      status,
      statusDetail: e.status.type.shortDetail ?? null,
      elapsedMinutes: status === 'LIVE' ? minute : null,
      period: status === 'LIVE' ? periodOf(e.status.type.name, e.status.period) : null,
      venue: comp.venue?.fullName ?? null,
      homeScore: started ? toInt(home.score) : null,
      awayScore: started ? toInt(away.score) : null,
      htHomeScore: started ? toInt(home.linescores?.[0]?.value) : null,
      htAwayScore: started ? toInt(away.linescores?.[0]?.value) : null,
      sourceTimestamp: fetchedAt,
    };
    out.fixtures.push(fixture);
    const o = comp.odds?.find((x) => x != null);
    if (o && status === 'SCHEDULED' && fixture.kickoff.getTime() > fetchedAt.getTime()) {
      const prices = mapPrices(o, fetchedAt);
      if (prices.length) {
        out.odds.push({
          ref: ref(e.id),
          sport: 'FOOTBALL',
          competitionKey: slug,
          competitionName: fixture.league.name,
          homeTeamName: fixture.home.name,
          awayTeamName: fixture.away.name,
          kickoff: fixture.kickoff,
          fixtureRef: ref(e.id),
          prices,
        });
      }
    }
  }
  return out;
}

const standingsSchema = z.object({
  children: z
    .array(
      z.object({
        name: z.string().optional(),
        standings: z.object({
          season: z.number().optional(),
          entries: z.array(
            z.object({
              team: z.object({ id: z.string(), displayName: z.string(), abbreviation: z.string().optional(), logos: z.array(z.object({ href: z.string() }).passthrough()).optional() }).passthrough(),
              stats: z.array(z.object({ name: z.string(), value: z.number().nullable().optional() }).passthrough()),
            }),
          ),
        }),
      }),
    )
    .default([]),
});

export function mapStandings(slug: string, raw: unknown): NormalizedStanding[] {
  const s = standingsSchema.parse(raw);
  const out: NormalizedStanding[] = [];
  const multiple = s.children.length > 1;
  for (const group of s.children) {
    for (const entry of group.standings.entries) {
      const stat = (n: string) => entry.stats.find((x) => x.name === n)?.value ?? 0;
      out.push({
        leagueRef: ref(slug),
        season: String(group.standings.season ?? ''),
        group: multiple ? (group.name ?? null) : null,
        team: { ref: ref(entry.team.id), sport: 'FOOTBALL', name: entry.team.displayName, shortName: entry.team.abbreviation ?? null, logoUrl: entry.team.logos?.[0]?.href ?? null },
        rank: stat('rank'),
        points: stat('points'),
        played: stat('gamesPlayed'),
        won: stat('wins'),
        drawn: stat('ties'),
        lost: stat('losses'),
        goalsFor: stat('pointsFor'),
        goalsAgainst: stat('pointsAgainst'),
        form: null,
      });
    }
  }
  return out.filter((r) => r.season && r.rank > 0);
}
