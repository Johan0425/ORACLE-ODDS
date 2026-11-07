import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FOOTBALL_MODEL_VERSION } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { PublicationPolicyService } from '../model-metrics/publication-policy.service';
import { VERIFIED, startOfLocalDay, timeZoneOffsetMs } from '../fixtures/fixtures.service';

const DAY = 86_400_000;

type Market = '1X2' | 'OU_GOALS' | 'BTTS';

export interface PickSelection {
  marketKey: Market;
  selectionKey: string;
  line: number | null;
  probability: number;
  fairOdds: number;
  confidenceLevel: string;
  /** Mejor cuota capturada (casa autorizada o de referencia) para esta selección. */
  marketPrice: number | null;
  marketBookmaker: string | null;
  /** Probabilidad del modelo − probabilidad implícita sin margen del mercado. */
  edge: number | null;
  result: 'WON' | 'LOST' | null;
}

/** Inicio (lunes 00:00 local) de la semana con desplazamiento `offset` respecto a la actual. */
export function weekRange(offset: number, timeZone: string, now = new Date()): { gte: Date; lt: Date } {
  const today = startOfLocalDay(now, timeZone);
  const local = new Date(today.getTime() + timeZoneOffsetMs(today, timeZone));
  const dow = (local.getUTCDay() + 6) % 7; // lunes = 0
  const monday = startOfLocalDay(new Date(today.getTime() - dow * DAY + offset * 7 * DAY + 12 * 3_600_000), timeZone);
  const nextMonday = startOfLocalDay(new Date(monday.getTime() + 7 * DAY + 12 * 3_600_000), timeZone);
  return { gte: monday, lt: nextMonday };
}

function settle(marketKey: Market, selectionKey: string, line: number | null, home: number | null, away: number | null): 'WON' | 'LOST' | null {
  if (home == null || away == null) return null;
  switch (marketKey) {
    case '1X2': {
      const actual = home > away ? 'HOME' : home === away ? 'DRAW' : 'AWAY';
      return actual === selectionKey ? 'WON' : 'LOST';
    }
    case 'OU_GOALS': {
      if (line == null || home + away === line) return null;
      const over = home + away > line;
      return (selectionKey === 'OVER') === over ? 'WON' : 'LOST';
    }
    case 'BTTS': {
      const both = home > 0 && away > 0;
      return (selectionKey === 'YES') === both ? 'WON' : 'LOST';
    }
  }
}

/**
 * Pronósticos por semana: para cada partido, la predicción vigente antes del
 * inicio (o la del backtest walk-forward si el partido se cargó como histórico)
 * con la selección más probable de 1X2, Más/Menos 2.5 y Ambos marcan, la cuota
 * de mercado disponible y, si ya terminó, si el pronóstico acertó.
 */
@Injectable()
export class PicksService {
  constructor(private readonly prisma: PrismaService, private readonly policy: PublicationPolicyService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Pronóstico resumido de un partido (mismo formato que cada elemento de la semana). */
  async fixture(idOrSlug: string) {
    const { items } = await this.build({ ...VERIFIED, sport: { key: 'FOOTBALL' }, OR: [{ id: idOrSlug }, { slug: idOrSlug }] });
    if (!items[0]) throw new NotFoundException(`Partido ${idOrSlug} no encontrado`);
    return items[0];
  }

  async week(params: { offset: number; leagueId?: string; country?: string }) {
    const range = weekRange(params.offset, this.env.DEFAULT_TIMEZONE);
    const where: Prisma.FixtureWhereInput = {
      ...VERIFIED,
      sport: { key: 'FOOTBALL' },
      kickoff: range,
      status: { notIn: ['CANCELLED'] },
      leagueId: params.leagueId,
      league: params.country ? { country: params.country } : undefined,
    };
    const { items, published, isPublished } = await this.build(where);
    return this.summarize(params.offset, range, items, published, isPublished);
  }

  private async build(where: Prisma.FixtureWhereInput) {
    const fixtures = await this.prisma.fixture.findMany({
      where,
      orderBy: { kickoff: 'asc' },
      take: 600,
      include: {
        homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, slug: true } },
        awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true, slug: true } },
        league: { select: { id: true, name: true, country: true, logoUrl: true, slug: true } },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } },
      },
    });
    const ids = fixtures.map((f) => f.id);
    const runs = ids.length
      ? await this.prisma.predictionRun.findMany({
          where: { fixtureId: { in: ids }, status: { in: ['COMPLETED', 'SUPERSEDED', 'BACKTEST'] } },
          orderBy: { generatedAt: 'desc' },
          select: {
            id: true,
            fixtureId: true,
            status: true,
            generatedAt: true,
            dataCutoff: true,
            lambdaHome: true,
            lambdaAway: true,
            modelVersion: true,
            probabilities: {
              where: { OR: [{ marketKey: '1X2' }, { marketKey: 'BTTS' }, { marketKey: 'OU_GOALS', line: 2.5 }] },
              select: { marketKey: true, selectionKey: true, line: true, calibratedProbability: true, fairOdds: true, confidenceLevel: true },
            },
          },
        })
      : [];
    const quotes = ids.length
      ? await this.prisma.oddsQuote.findMany({
          where: {
            fixtureId: { in: ids },
            isLive: false,
            OR: [{ marketKey: '1X2' }, { marketKey: 'BTTS' }, { marketKey: 'OU_GOALS', line: 2.5 }],
            bookmaker: { isActive: true, OR: [{ isAuthorized: true }, { slug: { in: this.env.REFERENCE_BOOKMAKERS } }] },
          },
          select: { fixtureId: true, marketKey: true, selectionKey: true, currentPrice: true, impliedProbabilityNoVig: true, bookmaker: { select: { name: true } } },
        })
      : [];
    const published = await this.policy.marketStatus(FOOTBALL_MODEL_VERSION, 'FOOTBALL');
    const isPublished = (m: string) => published.get(m)?.published === true || !this.policy.requireCalibration;

    const items = fixtures.map((f) => {
      const own = runs.filter((r) => r.fixtureId === f.id);
      // Antes del inicio vale la última predicción; después, la última generada antes del pitazo.
      const live = own.find((r) => r.status !== 'BACKTEST' && r.generatedAt <= (f.status === 'SCHEDULED' ? new Date() : f.kickoff));
      const run = live ?? own.find((r) => r.status === 'BACKTEST');
      const finished = f.status === 'FINISHED';
      const picks: PickSelection[] = [];
      if (run) {
        for (const market of ['1X2', 'OU_GOALS', 'BTTS'] as const) {
          if (!isPublished(market)) continue;
          const sels = run.probabilities.filter((p) => p.marketKey === market);
          const best = sels.sort((a, b) => b.calibratedProbability - a.calibratedProbability)[0];
          if (!best) continue;
          const q = quotes
            .filter((x) => x.fixtureId === f.id && x.marketKey === market && x.selectionKey === best.selectionKey)
            .sort((a, b) => b.currentPrice - a.currentPrice)[0];
          picks.push({
            marketKey: market,
            selectionKey: best.selectionKey,
            line: best.line,
            probability: best.calibratedProbability,
            fairOdds: best.fairOdds,
            confidenceLevel: best.confidenceLevel,
            marketPrice: q?.currentPrice ?? null,
            marketBookmaker: q?.bookmaker.name ?? null,
            edge: q?.impliedProbabilityNoVig != null ? best.calibratedProbability - q.impliedProbabilityNoVig : null,
            result: finished ? settle(market, best.selectionKey, best.line, f.homeScore, f.awayScore) : null,
          });
        }
      }
      const oneXTwo = run?.probabilities.filter((p) => p.marketKey === '1X2') ?? [];
      const p = (sel: string) => oneXTwo.find((x) => x.selectionKey === sel)?.calibratedProbability ?? null;
      // Pronóstico destacado: la selección más probable con al menos 55 %.
      const featured = [...picks].sort((a, b) => b.probability - a.probability).find((x) => x.probability >= 0.55) ?? null;
      return {
        id: f.id,
        slug: f.slug,
        kickoff: f.kickoff,
        status: f.status,
        statusDetail: f.statusDetail,
        elapsedMinutes: f.elapsedMinutes,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        league: f.league,
        hasAnalysis: f.analyses.length > 0,
        prediction: run
          ? {
              runId: run.id,
              source: run.status === 'BACKTEST' ? ('backtest' as const) : ('prematch' as const),
              generatedAt: run.generatedAt,
              expectedGoals: { home: run.lambdaHome, away: run.lambdaAway },
              oneXTwo: { HOME: p('HOME'), DRAW: p('DRAW'), AWAY: p('AWAY') },
            }
          : null,
        picks,
        featured,
      };
    });

    return { items, published, isPublished };
  }

  private summarize(
    offset: number,
    range: { gte: Date; lt: Date },
    items: Awaited<ReturnType<PicksService['build']>>['items'],
    published: Map<string, { published: boolean; reason: string }>,
    isPublished: (m: string) => boolean,
  ) {
    const settled = items.flatMap((i) => i.picks).filter((x) => x.result);
    const byMarket = (['1X2', 'OU_GOALS', 'BTTS'] as const).map((m) => {
      const list = settled.filter((x) => x.marketKey === m);
      return { marketKey: m, settled: list.length, won: list.filter((x) => x.result === 'WON').length };
    });
    const featuredSettled = items.map((i) => i.featured).filter((x): x is PickSelection => !!x?.result);
    const leagues = [...new Map(items.map((i) => [i.league.id, { ...i.league, fixtures: items.filter((x) => x.league.id === i.league.id).length }])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return {
      offset,
      range: { from: range.gte, to: range.lt },
      timezone: this.env.DEFAULT_TIMEZONE,
      requireCalibration: this.policy.requireCalibration,
      unpublishedMarkets: (['1X2', 'OU_GOALS', 'BTTS'] as const).filter((m) => !isPublished(m)).map((m) => ({ marketKey: m, reason: published.get(m)?.reason ?? 'Sin evaluación fuera de muestra todavía' })),
      summary: {
        fixtures: items.length,
        withPrediction: items.filter((i) => i.prediction).length,
        finished: items.filter((i) => i.status === 'FINISHED').length,
        byMarket,
        featured: { settled: featuredSettled.length, won: featuredSettled.filter((x) => x.result === 'WON').length },
      },
      leagues,
      items,
    };
  }
}
