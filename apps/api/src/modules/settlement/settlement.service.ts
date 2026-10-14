import { Injectable, Logger } from '@nestjs/common';
import type { SettlementResult } from '@prisma/client';
import { profitUnits, settleSelection, type FinalResult } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { settlementsCounter } from '../../common/metrics';

const SETTLEABLE = ['FINISHED', 'CANCELLED', 'ABANDONED'] as const;

/**
 * Liquidación automática. Usa exactamente las reglas del motor
 * (`settleSelection`) para que precio y resultado no diverjan. Las pérdidas se
 * registran igual que las ganancias: nunca se borran predicciones.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  async finalResult(fixtureId: string): Promise<FinalResult | null> {
    const f = await this.prisma.fixture.findUnique({ where: { id: fixtureId }, include: { stats: true } });
    if (!f || !SETTLEABLE.includes(f.status as (typeof SETTLEABLE)[number])) return null;
    if (f.status === 'FINISHED' && (f.homeScore == null || f.awayScore == null)) return null;
    const stats = f.stats;
    const both = stats.length === 2;
    const sum = (pick: (s: (typeof stats)[number]) => number | null) => {
      if (!both) return null;
      const values = stats.map(pick);
      return values.some((v) => v == null) ? null : (values as number[]).reduce((a, b) => a + b, 0);
    };
    return {
      status: f.status as FinalResult['status'],
      homeScore: f.homeScore ?? 0,
      awayScore: f.awayScore ?? 0,
      htHomeScore: f.htHomeScore,
      htAwayScore: f.htAwayScore,
      totalCorners: sum((s) => s.corners),
      totalCards: sum((s) => (s.yellowCards == null && s.redCards == null ? null : (s.yellowCards ?? 0) + (s.redCards ?? 0))),
    };
  }

  /** Precio de cierre: última cuota prepartido de la misma casa y selección antes del inicio. */
  async closingPrice(vb: { fixtureId: string; marketKey: string; selectionKey: string; lineKey: string; oddsSnapshotId: string }, kickoff: Date): Promise<number | null> {
    const snap = await this.prisma.oddsSnapshot.findUnique({ where: { id: vb.oddsSnapshotId }, select: { bookmakerId: true } });
    if (!snap) return null;
    const last = await this.prisma.oddsSnapshot.findFirst({
      where: { fixtureId: vb.fixtureId, bookmakerId: snap.bookmakerId, marketKey: vb.marketKey, selectionKey: vb.selectionKey, lineKey: vb.lineKey, isLive: false, capturedAt: { lte: kickoff } },
      orderBy: { capturedAt: 'desc' },
      select: { priceDecimal: true },
    });
    return last?.priceDecimal ?? null;
  }

  /** Cierra oportunidades cuyo partido ya empezó y registra el precio de cierre (CLV). */
  async closeStartedValueBets(now = new Date()): Promise<number> {
    const started = await this.prisma.valueBet.findMany({
      where: { status: { in: ['ACTIVE', 'WITHDRAWN'] }, closingPrice: null, fixture: { kickoff: { lte: now } } },
      include: { fixture: { select: { kickoff: true } } },
    });
    for (const vb of started) {
      const closing = await this.closingPrice(vb, vb.fixture.kickoff);
      await this.prisma.valueBet.update({
        where: { id: vb.id },
        data: {
          status: vb.status === 'ACTIVE' ? 'EXPIRED' : vb.status,
          closingPrice: closing,
          closingLineValue: closing ? vb.price / closing - 1 : null,
        },
      });
    }
    return started.length;
  }

  /** sync:settlements — liquida value bets, probabilidades y retos de partidos terminados. */
  async settlePending(): Promise<{ valueBets: number; probabilities: number; fixtures: number }> {
    const fixtures = await this.prisma.fixture.findMany({
      where: {
        status: { in: [...SETTLEABLE] },
        OR: [
          { valueBets: { some: { result: null } } },
          { predictionRuns: { some: { probabilities: { some: { outcome: null } } } } },
        ],
      },
      select: { id: true, kickoff: true },
      take: 500,
    });
    let vbCount = 0;
    let probCount = 0;
    for (const f of fixtures) {
      const result = await this.finalResult(f.id);
      if (!result) continue;
      const bets = await this.prisma.valueBet.findMany({ where: { fixtureId: f.id, result: null } });
      for (const vb of bets) {
        const outcome = settleSelection({ marketKey: vb.marketKey, selectionKey: vb.selectionKey, line: vb.line }, result) as SettlementResult;
        const closing = vb.closingPrice ?? (await this.closingPrice(vb, f.kickoff));
        await this.prisma.valueBet.update({
          where: { id: vb.id },
          data: {
            result: outcome,
            // Seguimiento a stake plano de 1 unidad para que el ROI sea comparable entre picks.
            profitLossUnits: profitUnits(outcome, 1, vb.price),
            status: 'SETTLED',
            settledAt: new Date(),
            closingPrice: closing,
            closingLineValue: closing ? vb.price / closing - 1 : null,
          },
        });
        settlementsCounter.inc({ kind: 'value_bet', result: outcome });
        vbCount += 1;
      }
      const probs = await this.prisma.calculatedProbability.findMany({
        where: { outcome: null, predictionRun: { fixtureId: f.id } },
        select: { id: true, marketKey: true, selectionKey: true, line: true },
      });
      for (const p of probs) {
        const outcome = settleSelection({ marketKey: p.marketKey, selectionKey: p.selectionKey, line: p.line }, result) as SettlementResult;
        await this.prisma.calculatedProbability.update({ where: { id: p.id }, data: { outcome } });
        probCount += 1;
      }
      settlementsCounter.inc({ kind: 'probability', result: 'any' }, probs.length);
    }
    return { valueBets: vbCount, probabilities: probCount, fixtures: fixtures.length };
  }
}
