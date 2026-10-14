import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { FixtureStatus, Prisma } from '@prisma/client';
import { LIVE_FRESHNESS, PREMATCH_FRESHNESS, detectArbitrage, freshnessScore, inPlayProbabilities, isMarketKey, MARKET_DEFINITIONS } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { PublicationPolicyService } from '../model-metrics/publication-policy.service';
import { SPONSOR_SLUG } from '../affiliate/sponsor.service';

export interface FindFixturesQuery {
  sport?: string;
  leagueId?: string;
  /** today | tomorrow | week | YYYY-MM-DD */
  date?: string;
  status?: FixtureStatus;
  q?: string;
  page: number;
  limit: number;
}

const FIXTURE_INCLUDE = {
  homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, slug: true } },
  awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, slug: true } },
  league: { select: { id: true, name: true, country: true, logoUrl: true, slug: true } },
  sport: { select: { key: true, name: true } },
} satisfies Prisma.FixtureInclude;

/** Solo partidos con procedencia de un proveedor real. Los registros legados sin origen nunca se exponen. */
export const VERIFIED: Prisma.FixtureWhereInput = { primaryProvider: { not: null } };

/** Desfase (ms) de una zona IANA en un instante: hora local − UTC. Independiente de la zona de la máquina. */
export function timeZoneOffsetMs(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Inicio del día local (zona IANA) expresado en UTC. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const local = new Date(date.getTime() + timeZoneOffsetMs(date, timeZone));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightAsUtc - timeZoneOffsetMs(new Date(midnightAsUtc), timeZone));
}

export function dateRange(spec: string | undefined, timeZone: string, now = new Date()): { gte: Date; lt: Date } | undefined {
  if (!spec) return undefined;
  const today = startOfLocalDay(now, timeZone);
  const day = 86_400_000;
  if (spec === 'today') return { gte: today, lt: new Date(today.getTime() + day) };
  if (spec === 'tomorrow') return { gte: new Date(today.getTime() + day), lt: new Date(today.getTime() + 2 * day) };
  if (spec === 'week') return { gte: today, lt: new Date(today.getTime() + 8 * day) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(spec)) {
    const start = startOfLocalDay(new Date(`${spec}T12:00:00Z`), timeZone);
    return { gte: start, lt: new Date(start.getTime() + day) };
  }
  return undefined;
}

@Injectable()
export class FixturesService {
  constructor(private readonly prisma: PrismaService, private readonly policy: PublicationPolicyService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  async findAll(query: FindFixturesQuery) {
    const range = dateRange(query.date, this.env.DEFAULT_TIMEZONE);
    const where: Prisma.FixtureWhereInput = {
      ...VERIFIED,
      sport: query.sport ? { key: query.sport as never } : undefined,
      leagueId: query.leagueId,
      status: query.status,
      kickoff: range,
      ...(query.q
        ? { OR: [{ homeTeam: { name: { contains: query.q, mode: 'insensitive' } } }, { awayTeam: { name: { contains: query.q, mode: 'insensitive' } } }, { league: { name: { contains: query.q, mode: 'insensitive' } } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.fixture.findMany({
        where,
        orderBy: { kickoff: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { ...FIXTURE_INCLUDE, _count: { select: { oddsQuotes: true, valueBets: { where: { status: 'ACTIVE' } } } } },
      }),
      this.prisma.fixture.count({ where }),
    ]);
    return { items, meta: { total, page: query.page, limit: query.limit, timezone: this.env.DEFAULT_TIMEZONE } };
  }

  async findLive(sport?: string, leagueId?: string) {
    const fixtures = await this.prisma.fixture.findMany({
      where: { ...VERIFIED, status: { in: ['LIVE', 'SUSPENDED'] }, sport: sport ? { key: sport as never } : undefined, leagueId },
      include: { ...FIXTURE_INCLUDE, events: { orderBy: [{ minute: 'desc' }, { extraMinute: 'desc' }], take: 5 } },
      orderBy: { kickoff: 'asc' },
    });
    const now = Date.now();
    return Promise.all(
      fixtures.map(async (f) => {
        const ageSeconds = f.lastScoreUpdateAt ? (now - f.lastScoreUpdateAt.getTime()) / 1000 : (now - f.updatedAt.getTime()) / 1000;
        return {
          ...f,
          dataAgeSeconds: Math.round(ageSeconds),
          isDelayed: ageSeconds > this.env.LIVE_MAX_LATENCY_SECONDS,
          inPlay: await this.inPlay(f.id),
        };
      }),
    );
  }

  /** Probabilidad prepartido frente a la actualizada por minuto y marcador. */
  async inPlay(fixtureId: string) {
    const f = await this.prisma.fixture.findUnique({ where: { id: fixtureId }, include: { events: { where: { type: 'Card', detail: { contains: 'Red' } } } } });
    if (!f || f.status !== 'LIVE' || f.homeScore == null || f.awayScore == null || f.elapsedMinutes == null) return null;
    const run = await this.prisma.predictionRun.findFirst({
      where: { fixtureId, generatedAt: { lte: f.kickoff }, lambdaHome: { not: null } },
      orderBy: { generatedAt: 'desc' },
      include: { probabilities: { where: { marketKey: '1X2' } } },
    });
    if (!run?.lambdaHome || !run.lambdaAway) return null;
    const live = inPlayProbabilities({
      lambdaHome: run.lambdaHome,
      lambdaAway: run.lambdaAway,
      elapsedMinutes: f.elapsedMinutes,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      homeRedCards: f.events.filter((e) => e.teamId === f.homeTeamId).length,
      awayRedCards: f.events.filter((e) => e.teamId === f.awayTeamId).length,
    });
    const pre = Object.fromEntries(run.probabilities.map((p) => [p.selectionKey, p.calibratedProbability]));
    return { prematch: pre, live: live.oneXTwo, overUnder: live.overUnder, method: 'Poisson del tiempo restante sobre λ prepartido (sin ritmo en vivo)' };
  }

  async findOne(idOrSlug: string) {
    const fixture = await this.prisma.fixture.findFirst({
      where: { ...VERIFIED, OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        ...FIXTURE_INCLUDE,
        lineups: { include: { team: { select: { id: true, name: true } } } },
        injuries: { include: { player: { select: { name: true } }, team: { select: { id: true, name: true } } } },
        events: { orderBy: [{ minute: 'asc' }, { extraMinute: 'asc' }] },
      },
    });
    if (!fixture) throw new NotFoundException(`Partido ${idOrSlug} no encontrado`);
    const [standings, homeForm, awayForm, h2h] = await Promise.all([
      this.prisma.standing.findMany({ where: { leagueId: fixture.leagueId }, orderBy: [{ groupName: 'asc' }, { rank: 'asc' }], include: { team: { select: { id: true, name: true, logoUrl: true } } } }),
      this.form(fixture.homeTeamId, fixture.kickoff),
      this.form(fixture.awayTeamId, fixture.kickoff),
      this.h2h(fixture.homeTeamId, fixture.awayTeamId, fixture.kickoff),
    ]);
    const latestSeason = standings.reduce((acc, s) => (s.season > acc ? s.season : acc), '');
    return {
      ...fixture,
      standings: standings.filter((s) => s.season === latestSeason),
      form: { home: homeForm, away: awayForm },
      h2h,
      dataAgeSeconds: Math.round((Date.now() - fixture.updatedAt.getTime()) / 1000),
    };
  }

  async form(teamId: string, before: Date, lastN = 5) {
    const fixtures = await this.prisma.fixture.findMany({
      where: { ...VERIFIED, status: 'FINISHED', kickoff: { lt: before }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      orderBy: { kickoff: 'desc' },
      take: lastN,
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    });
    return fixtures.map((f) => {
      const isHome = f.homeTeamId === teamId;
      const gf = (isHome ? f.homeScore : f.awayScore) ?? 0;
      const ga = (isHome ? f.awayScore : f.homeScore) ?? 0;
      return { fixtureId: f.id, kickoff: f.kickoff, opponent: isHome ? f.awayTeam.name : f.homeTeam.name, venue: isHome ? 'H' : 'A', goalsFor: gf, goalsAgainst: ga, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L' };
    });
  }

  async h2h(a: string, b: string, before: Date, lastN = 6) {
    const fixtures = await this.prisma.fixture.findMany({
      where: { ...VERIFIED, status: 'FINISHED', kickoff: { lt: before }, OR: [{ homeTeamId: a, awayTeamId: b }, { homeTeamId: b, awayTeamId: a }] },
      orderBy: { kickoff: 'desc' },
      take: lastN,
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, league: { select: { name: true } } },
    });
    return fixtures.map((f) => ({ fixtureId: f.id, kickoff: f.kickoff, league: f.league.name, homeTeam: f.homeTeam.name, awayTeam: f.awayTeam.name, homeScore: f.homeScore, awayScore: f.awayScore }));
  }

  async statistics(id: string) {
    const f = await this.prisma.fixture.findFirst({ where: { ...VERIFIED, id }, select: { id: true } });
    if (!f) throw new NotFoundException(`Partido ${id} no encontrado`);
    return this.prisma.fixtureStat.findMany({ where: { fixtureId: id }, include: { team: { select: { id: true, name: true } } } });
  }

  /** Última predicción vigente con el estado de publicación de cada mercado. */
  async predictions(id: string) {
    const fixture = await this.prisma.fixture.findFirst({ where: { ...VERIFIED, id }, include: { sport: true } });
    if (!fixture) throw new NotFoundException(`Partido ${id} no encontrado`);
    if (fixture.sport.key !== 'FOOTBALL') {
      return { available: false, reason: `El modelo para ${fixture.sport.name} todavía no está implementado: solo se ofrece comparación de cuotas.`, markets: [] };
    }
    const run = await this.prisma.predictionRun.findFirst({
      where: { fixtureId: id, status: { in: ['COMPLETED', 'SUPERSEDED'] }, generatedAt: { lte: fixture.status === 'SCHEDULED' ? new Date() : fixture.kickoff } },
      orderBy: { generatedAt: 'desc' },
      include: { probabilities: { orderBy: [{ marketKey: 'asc' }, { lineKey: 'asc' }] } },
    });
    if (!run) return { available: false, reason: 'Sin predicción todavía: faltan datos históricos suficientes o el cálculo aún no se ejecutó.', markets: [] };
    const markets = new Map<string, { marketKey: string; displayName: string; publication: Awaited<ReturnType<PublicationPolicyService['isPublished']>>; selections: unknown[] }>();
    for (const p of run.probabilities) {
      if (!markets.has(p.marketKey)) {
        markets.set(p.marketKey, {
          marketKey: p.marketKey,
          displayName: isMarketKey(p.marketKey) ? MARKET_DEFINITIONS[p.marketKey].displayName : p.marketKey,
          publication: await this.policy.isPublished(run.modelVersion, 'FOOTBALL', p.marketKey),
          selections: [],
        });
      }
      const m = markets.get(p.marketKey)!;
      if (m.publication.published) {
        const { factors, ...rest } = p;
        const f = factors as { items?: unknown[]; confidenceReductions?: string[] };
        m.selections.push({ ...rest, factors: f.items ?? [], confidenceReductions: f.confidenceReductions ?? [] });
      }
    }
    return {
      available: true,
      run: { id: run.id, modelVersion: run.modelVersion, dataCutoff: run.dataCutoff, generatedAt: run.generatedAt, dataQuality: run.dataQuality, lambdas: { home: run.lambdaHome, away: run.lambdaAway }, trainingWindow: run.trainingWindow, status: run.status },
      requireCalibration: this.policy.requireCalibration,
      markets: [...markets.values()],
    };
  }

  /**
   * Comparador: por mercado/línea/selección, cuotas de casas autorizadas con
   * apertura, actual, movimiento, diferencia frente al promedio, frescura y
   * detección de arbitraje matemático.
   */
  async odds(id: string, opts: { live?: boolean; includeStale?: boolean } = {}) {
    const fixture = await this.prisma.fixture.findFirst({ where: { ...VERIFIED, id }, select: { id: true, kickoff: true, status: true } });
    if (!fixture) throw new NotFoundException(`Partido ${id} no encontrado`);
    const live = opts.live ?? fixture.status === 'LIVE';
    const thresholds = live
      ? { freshSeconds: LIVE_FRESHNESS.freshSeconds, staleSeconds: this.env.LIVE_ODDS_STALE_SECONDS }
      : { freshSeconds: PREMATCH_FRESHNESS.freshSeconds, staleSeconds: this.env.PREMATCH_ODDS_STALE_SECONDS };
    const quotes = await this.prisma.oddsQuote.findMany({
      where: { fixtureId: id, isLive: live, bookmaker: { isAuthorized: true, isActive: true } },
      include: { bookmaker: { select: { slug: true, name: true, logoUrl: true, licenseLabel: true, affiliateUrl: true, priority: true } } },
      orderBy: [{ marketKey: 'asc' }, { lineKey: 'asc' }],
    });
    const now = Date.now();
    const groups = new Map<string, typeof quotes>();
    for (const q of quotes) {
      const key = `${q.marketKey}|${q.lineKey}`;
      groups.set(key, [...(groups.get(key) ?? []), q]);
    }
    const markets = [...groups.entries()].map(([key, list]) => {
      const [marketKey, lk] = key.split('|');
      const def = isMarketKey(marketKey) ? MARKET_DEFINITIONS[marketKey] : null;
      const rows = list.map((q) => {
        const age = (now - q.lastSeenAt.getTime()) / 1000;
        return {
          bookmaker: q.bookmaker,
          selectionKey: q.selectionKey,
          price: q.currentPrice,
          openingPrice: q.openingPrice,
          previousPrice: q.previousPrice,
          movementFromOpening: q.currentPrice / q.openingPrice - 1,
          impliedProbabilityNoVig: q.impliedProbabilityNoVig,
          overround: q.overround,
          isSuspended: q.isSuspended,
          updatedAt: q.lastSeenAt,
          sourceTimestamp: q.sourceTimestamp,
          ageSeconds: Math.round(age),
          freshness: freshnessScore(age, thresholds),
          isStale: age >= thresholds.staleSeconds,
          directBetUrl: q.directBetUrl,
          isAffiliate: !!q.bookmaker.affiliateUrl || q.bookmaker.slug === SPONSOR_SLUG,
        };
      });
      const visible = rows.filter((r) => (opts.includeStale || !r.isStale) && !r.isSuspended);
      const canonical = def && def.selections !== 'SCORES' ? (def.selections as readonly string[]) : [];
      const order = (k: string) => (canonical.includes(k) ? canonical.indexOf(k) : 99);
      const selections = [...new Set(rows.map((r) => r.selectionKey))].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((sel) => {
        const quotesFor = visible.filter((r) => r.selectionKey === sel).sort((a, b) => b.price - a.price);
        const avg = quotesFor.length ? quotesFor.reduce((s, r) => s + r.price, 0) / quotesFor.length : null;
        return {
          selectionKey: sel,
          best: quotesFor[0] ?? null,
          average: avg,
          quotes: quotesFor.map((r) => ({ ...r, diffVsAverage: avg ? r.price / avg - 1 : null })),
        };
      });
      const needed = def && def.selections !== 'SCORES' && def.key !== 'DC' ? def.selections : null;
      const bests = needed?.map((s) => selections.find((x) => x.selectionKey === s)?.best ?? null);
      const arbitrage =
        bests && bests.every((b) => b)
          ? (() => {
              const r = detectArbitrage(bests.map((b, i) => ({ selection: needed![i], bookmaker: b!.bookmaker.name, price: b!.price, capturedAt: b!.updatedAt })));
              return r.isArbitrage ? { ...r, detectedAt: new Date().toISOString() } : null;
            })()
          : null;
      return {
        marketKey,
        displayName: def?.displayName ?? marketKey,
        line: list[0].line,
        lineKey: lk,
        selections,
        hiddenStale: rows.filter((r) => r.isStale).length,
        arbitrage,
      };
    });
    return {
      fixtureId: id,
      live,
      thresholds,
      bookmakers: [...new Map(quotes.map((q) => [q.bookmaker.slug, q.bookmaker])).values()],
      lastUpdate: quotes.reduce<Date | null>((acc, q) => (!acc || q.lastSeenAt > acc ? q.lastSeenAt : acc), null),
      markets,
      disclaimer: 'Las cuotas pueden cambiar. Verifica la información directamente con el operador antes de tomar una decisión.',
    };
  }

  async oddsHistory(id: string, marketKey: string, lineKeyValue = '', selectionKey?: string) {
    const fixture = await this.prisma.fixture.findFirst({ where: { ...VERIFIED, id }, select: { id: true } });
    if (!fixture) throw new NotFoundException(`Partido ${id} no encontrado`);
    const snaps = await this.prisma.oddsSnapshot.findMany({
      where: { fixtureId: id, marketKey, lineKey: lineKeyValue, selectionKey, bookmaker: { isAuthorized: true, isActive: true } },
      orderBy: { capturedAt: 'asc' },
      take: 5000,
      include: { bookmaker: { select: { slug: true, name: true } } },
    });
    const series = new Map<string, { bookmaker: { slug: string; name: string }; selectionKey: string; points: Array<{ at: Date; price: number; isLive: boolean }> }>();
    for (const s of snaps) {
      const key = `${s.bookmaker.slug}|${s.selectionKey}`;
      const entry = series.get(key) ?? { bookmaker: s.bookmaker, selectionKey: s.selectionKey, points: [] };
      entry.points.push({ at: s.capturedAt, price: s.priceDecimal, isLive: s.isLive });
      series.set(key, entry);
    }
    return { fixtureId: id, marketKey, lineKey: lineKeyValue, series: [...series.values()] };
  }
}
