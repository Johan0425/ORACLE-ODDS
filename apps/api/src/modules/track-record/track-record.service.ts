import { Injectable } from '@nestjs/common';
import type { Prisma, SettlementResult } from '@prisma/client';
import { bettingMetrics, bootstrapInterval, oddsBucket } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';

export interface TrackRecordQuery {
  market?: string;
  leagueId?: string;
  result?: SettlementResult;
  from?: Date;
  to?: Date;
  oddsBucket?: string;
  page: number;
  limit: number;
}

/**
 * Historial auditable: todas las oportunidades publicadas (incluidas las
 * perdidas y las retiradas antes del inicio), liquidadas a su precio de
 * publicación con stake plano de 1 unidad.
 */
@Injectable()
export class TrackRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async get(q: TrackRecordQuery) {
    const where: Prisma.ValueBetWhereInput = {
      marketKey: q.market,
      result: q.result,
      detectedAt: { gte: q.from, lte: q.to },
      fixture: { leagueId: q.leagueId },
    };
    const all = await this.prisma.valueBet.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      include: { fixture: { include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } }, league: { select: { id: true, name: true } } } }, predictionRun: { select: { modelVersion: true } } },
    });
    const filtered = q.oddsBucket ? all.filter((b) => oddsBucket(b.price) === q.oddsBucket) : all;
    const settled = filtered.filter((b) => b.result != null);
    const asSettled = settled.map((b) => ({ stake: 1, odds: b.price, profit: b.profitLossUnits ?? 0, outcome: b.result!, closingOdds: b.closingPrice, settledAt: b.settledAt ?? undefined }));
    const m = bettingMetrics(asSettled);
    const nonVoid = asSettled.filter((s) => s.outcome !== 'VOID');
    const roiCi = bootstrapInterval(nonVoid, (s) => s.reduce((a, b) => a + b.profit, 0) / Math.max(1, s.length));
    let cumulative = 0;
    const equity = [...settled]
      .sort((a, b) => (a.settledAt?.getTime() ?? 0) - (b.settledAt?.getTime() ?? 0))
      .map((b) => ({ at: b.settledAt, units: (cumulative += b.profitLossUnits ?? 0) }));
    const counts = {
      total: filtered.length,
      pending: filtered.filter((b) => b.result == null).length,
      won: settled.filter((b) => b.result === 'WIN' || b.result === 'HALF_WIN').length,
      lost: settled.filter((b) => b.result === 'LOSS' || b.result === 'HALF_LOSS').length,
      push: settled.filter((b) => b.result === 'PUSH').length,
      void: settled.filter((b) => b.result === 'VOID').length,
      withdrawnBeforeKickoff: filtered.filter((b) => b.withdrawnAt != null).length,
    };
    const start = (q.page - 1) * q.limit;
    return {
      summary: { ...m, roiCi, counts, stakeModel: 'Stake plano de 1 unidad a la cuota de publicación' },
      equity,
      items: filtered.slice(start, start + q.limit).map((b) => ({
        id: b.id,
        detectedAt: b.detectedAt,
        fixture: { id: b.fixture.id, kickoff: b.fixture.kickoff, homeTeam: b.fixture.homeTeam.name, awayTeam: b.fixture.awayTeam.name, league: b.fixture.league.name, homeScore: b.fixture.homeScore, awayScore: b.fixture.awayScore, status: b.fixture.status },
        marketKey: b.marketKey,
        selectionKey: b.selectionKey,
        line: b.line,
        bookmakerSlug: b.bookmakerSlug,
        price: b.price,
        probability: b.probability,
        marketProbability: b.marketProbability,
        edge: b.edge,
        expectedValue: b.expectedValue,
        qualityScore: b.qualityScore,
        status: b.status,
        withdrawnAt: b.withdrawnAt,
        result: b.result,
        profitLossUnits: b.profitLossUnits,
        closingPrice: b.closingPrice,
        closingLineValue: b.closingLineValue,
        modelVersion: b.predictionRun.modelVersion,
      })),
      meta: { total: filtered.length, page: q.page, limit: q.limit },
    };
  }
}
