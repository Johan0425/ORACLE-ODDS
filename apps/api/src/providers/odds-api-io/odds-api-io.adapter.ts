import { z } from 'zod';
import type { SportKey } from '@prisma/client';
import type { AppEnv } from '../../config/env';
import { ProviderHttpClient, ProviderHttpError, type QuotaGate } from '../../common/http/provider-http-client';
import type { OddsProvider } from '../interfaces';
import type { NormalizedOddsEvent, NormalizedPrice } from '../types';
import { slugify } from '../api-football/api-football.mappers';

const P = 'ODDS_API_IO' as const;

const num = z.union([z.string(), z.number()]).transform((v) => Number(v));
const oddsRow = z
  .object({
    home: num.optional(),
    draw: num.optional(),
    away: num.optional(),
    over: num.optional(),
    under: num.optional(),
    yes: num.optional(),
    no: num.optional(),
    hdp: num.optional(),
    max: num.optional(),
  })
  .passthrough();
const marketSchema = z.object({ name: z.string(), odds: z.array(oddsRow), updatedAt: z.string().optional() });
export const oddsApiIoEventSchema = z.object({
  id: z.union([z.number(), z.string()]),
  home: z.string(),
  away: z.string(),
  date: z.string(),
  status: z.string().optional(),
  league: z.object({ name: z.string().optional(), slug: z.string().optional() }).partial().optional(),
  bookmakers: z.record(z.array(marketSchema)).default({}),
});

/** Mapea un evento de odds-api.io (formato documentado en docs.odds-api.io/guides/fetching-odds). */
export function mapOddsApiIoEvent(raw: unknown, sport: SportKey, now = new Date()): NormalizedOddsEvent | null {
  const p = oddsApiIoEventSchema.safeParse(raw);
  if (!p.success) return null;
  const e = p.data;
  const kickoff = new Date(e.date);
  const isLive = e.status === 'live' || (e.status !== 'pending' && kickoff <= now);
  const isSoccer = sport === 'FOOTBALL';
  const prices: NormalizedPrice[] = [];
  for (const [bookName, markets] of Object.entries(e.bookmakers)) {
    for (const m of markets) {
      const ts = m.updatedAt ? new Date(m.updatedAt) : now;
      const base = { bookmaker: { key: slugify(bookName), name: bookName }, isLive, isSuspended: false, sourceTimestamp: ts };
      const add = (marketKey: string, selectionKey: string, line: number | null, price: number | undefined) => {
        if (price != null && price > 1) prices.push({ ...base, marketKey, selectionKey, line, priceDecimal: price });
      };
      for (const row of m.odds) {
        switch (m.name) {
          case 'ML':
            if (isSoccer || row.draw != null) {
              add('1X2', 'HOME', null, row.home);
              add('1X2', 'DRAW', null, row.draw);
              add('1X2', 'AWAY', null, row.away);
            } else {
              add('ML', 'HOME', null, row.home);
              add('ML', 'AWAY', null, row.away);
            }
            break;
          case 'ML HT':
            add('1X2_H1', 'HOME', null, row.home);
            add('1X2_H1', 'DRAW', null, row.draw);
            add('1X2_H1', 'AWAY', null, row.away);
            break;
          case 'Spread':
            if (row.hdp == null) break;
            add(isSoccer ? 'AH' : 'SPREAD', 'HOME', row.hdp, row.home);
            add(isSoccer ? 'AH' : 'SPREAD', 'AWAY', row.hdp, row.away);
            break;
          case 'Totals':
          case 'Totals HT': {
            if (row.max == null) break;
            const key = m.name === 'Totals HT' ? 'OU_GOALS_H1' : isSoccer ? 'OU_GOALS' : 'OU_POINTS';
            add(key, 'OVER', row.max, row.over);
            add(key, 'UNDER', row.max, row.under);
            break;
          }
          case 'Both Teams To Score':
            add('BTTS', 'YES', null, row.yes);
            add('BTTS', 'NO', null, row.no);
            break;
          case 'Draw No Bet':
            add('DNB', 'HOME', null, row.home);
            add('DNB', 'AWAY', null, row.away);
            break;
          default:
            break;
        }
      }
    }
  }
  return {
    ref: { provider: P, externalId: String(e.id) },
    sport,
    competitionKey: e.league?.slug ?? 'odds-api-io',
    competitionName: e.league?.name ?? null,
    homeTeamName: e.home,
    awayTeamName: e.away,
    kickoff,
    prices,
  };
}

/**
 * Proveedor opcional (ENABLE_ODDS_API_IO + ODDS_API_IO_KEY). Amplía cobertura de
 * casas; el producto no depende de él. Consulta eventos por deporte/liga y
 * cuotas en lotes de 10 eventos (/odds/multi).
 */
export class OddsApiIoAdapter implements OddsProvider {
  readonly provider = P;
  private readonly http: ProviderHttpClient | null;

  constructor(private readonly env: AppEnv, quota?: QuotaGate, fetchImpl?: typeof fetch) {
    this.http =
      env.ENABLE_ODDS_API_IO && env.ODDS_API_IO_KEY
        ? new ProviderHttpClient({
            provider: P,
            baseUrl: env.ODDS_API_IO_BASE_URL,
            query: { apiKey: env.ODDS_API_IO_KEY },
            perMinute: 60,
            quota,
            fetchImpl,
          })
        : null;
  }

  isConfigured(): boolean {
    return this.http != null;
  }

  /** `competitionKey` con formato `sport:leagueSlug` (p. ej. `football:england-premier-league`). */
  private async fetch(competitionKey: string, status: 'pending' | 'live'): Promise<NormalizedOddsEvent[]> {
    if (!this.http) throw new ProviderHttpError(P, 0, 'odds-api.io deshabilitado o sin clave', false);
    const [sportSlug, league] = competitionKey.split(':');
    const sport: SportKey = sportSlug === 'football' ? 'FOOTBALL' : sportSlug === 'basketball' ? 'BASKETBALL' : sportSlug === 'tennis' ? 'TENNIS' : 'FOOTBALL';
    const events = await this.http.get<unknown[]>('events', { sport: sportSlug, league, status });
    const ids = (Array.isArray(events.data) ? events.data : [])
      .map((e) => (e as { id?: unknown }).id)
      .filter((id): id is string | number => id != null)
      .slice(0, 50);
    const bookmakers = this.env.ALLOWED_BOOKMAKERS.join(',');
    if (!bookmakers) return [];
    const out: NormalizedOddsEvent[] = [];
    for (let i = 0; i < ids.length; i += 10) {
      const res = await this.http.get<unknown[]>('odds/multi', { eventIds: ids.slice(i, i + 10).join(','), bookmakers });
      for (const raw of Array.isArray(res.data) ? res.data : []) {
        const mapped = mapOddsApiIoEvent(raw, sport);
        if (mapped) out.push(mapped);
      }
    }
    return out;
  }

  getPrematchOdds(competitionKey: string) {
    return this.fetch(competitionKey, 'pending');
  }

  getLiveOdds(competitionKey: string) {
    return this.fetch(competitionKey, 'live');
  }
}
