import type { SportKey } from '@prisma/client';
import { z } from 'zod';
import type { NormalizedOddsEvent, NormalizedPrice, NormalizedScoreUpdate } from '../types';

const P = 'THE_ODDS_API' as const;

export function sportFromKey(sportKey: string): SportKey | null {
  const prefix = sportKey.split('_')[0];
  const map: Record<string, SportKey> = {
    soccer: 'FOOTBALL',
    basketball: 'BASKETBALL',
    tennis: 'TENNIS',
    baseball: 'BASEBALL',
    americanfootball: 'NFL',
    icehockey: 'HOCKEY',
    mma: 'MMA',
  };
  return map[prefix] ?? null;
}

const outcome = z.object({
  name: z.string(),
  price: z.number(),
  point: z.number().nullable().optional(),
  link: z.string().nullable().optional(),
});
const market = z.object({ key: z.string(), last_update: z.string().optional(), outcomes: z.array(outcome), link: z.string().nullable().optional() });
const bookmaker = z.object({ key: z.string(), title: z.string(), last_update: z.string(), markets: z.array(market), link: z.string().nullable().optional() });
export const oddsEventSchema = z.object({
  id: z.string(),
  sport_key: z.string(),
  sport_title: z.string().optional(),
  commence_time: z.string(),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(bookmaker).default([]),
});

function mapOutcome(
  sport: SportKey,
  marketKey: string,
  o: z.infer<typeof outcome>,
  home: string,
  away: string,
): { marketKey: string; selectionKey: string; line: number | null } | null {
  const isSoccer = sport === 'FOOTBALL';
  const side = o.name === home ? 'HOME' : o.name === away ? 'AWAY' : null;
  switch (marketKey) {
    case 'h2h':
      if (o.name.toLowerCase() === 'draw') return isSoccer ? { marketKey: '1X2', selectionKey: 'DRAW', line: null } : null;
      return side ? { marketKey: isSoccer ? '1X2' : 'ML', selectionKey: side, line: null } : null;
    case 'spreads':
      if (!side || o.point == null) return null;
      // Línea canónica desde la perspectiva del local.
      return { marketKey: isSoccer ? 'AH' : 'SPREAD', selectionKey: side, line: side === 'HOME' ? o.point : -o.point };
    case 'totals': {
      const sel = o.name.toUpperCase();
      if ((sel !== 'OVER' && sel !== 'UNDER') || o.point == null) return null;
      return { marketKey: isSoccer ? 'OU_GOALS' : 'OU_POINTS', selectionKey: sel, line: o.point };
    }
    case 'btts': {
      const sel = o.name.toUpperCase();
      return sel === 'YES' || sel === 'NO' ? { marketKey: 'BTTS', selectionKey: sel, line: null } : null;
    }
    case 'draw_no_bet':
      return side ? { marketKey: 'DNB', selectionKey: side, line: null } : null;
    default:
      return null;
  }
}

export function mapOddsEvents(items: unknown[], now = new Date()): { events: NormalizedOddsEvent[]; rejected: number } {
  const events: NormalizedOddsEvent[] = [];
  let rejected = 0;
  for (const raw of items) {
    const p = oddsEventSchema.safeParse(raw);
    if (!p.success) {
      rejected += 1;
      continue;
    }
    const e = p.data;
    const sport = sportFromKey(e.sport_key);
    if (!sport) {
      rejected += 1;
      continue;
    }
    const kickoff = new Date(e.commence_time);
    const isLive = kickoff.getTime() <= now.getTime();
    const prices: NormalizedPrice[] = [];
    for (const b of e.bookmakers) {
      for (const m of b.markets) {
        for (const o of m.outcomes) {
          const mapped = mapOutcome(sport, m.key, o, e.home_team, e.away_team);
          if (!mapped || !(o.price > 1)) continue;
          prices.push({
            bookmaker: { key: b.key, name: b.title },
            ...mapped,
            priceDecimal: o.price,
            isLive,
            isSuspended: false,
            sourceTimestamp: new Date(m.last_update ?? b.last_update),
            directBetUrl: o.link ?? m.link ?? b.link ?? null,
          });
        }
      }
    }
    events.push({
      ref: { provider: P, externalId: e.id },
      sport,
      competitionKey: e.sport_key,
      competitionName: e.sport_title ?? null,
      homeTeamName: e.home_team,
      awayTeamName: e.away_team,
      kickoff,
      prices,
    });
  }
  return { events, rejected };
}

const scoreSchema = z.object({
  id: z.string(),
  completed: z.boolean(),
  home_team: z.string(),
  away_team: z.string(),
  scores: z.array(z.object({ name: z.string(), score: z.string() })).nullable().optional(),
  last_update: z.string().nullable().optional(),
});

export function mapScores(items: unknown[]): NormalizedScoreUpdate[] {
  return items.flatMap((raw) => {
    const p = scoreSchema.safeParse(raw);
    if (!p.success) return [];
    const s = p.data;
    const find = (team: string) => {
      const v = s.scores?.find((x) => x.name === team)?.score;
      const n = v != null ? Number(v) : NaN;
      return Number.isFinite(n) ? n : null;
    };
    return [
      {
        ref: { provider: P, externalId: s.id },
        completed: s.completed,
        homeScore: find(s.home_team),
        awayScore: find(s.away_team),
        lastUpdate: s.last_update ? new Date(s.last_update) : null,
      },
    ];
  });
}
