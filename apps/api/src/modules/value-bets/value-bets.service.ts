import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  FOOTBALL_MODEL_VERSION,
  PREMATCH_FRESHNESS,
  freshnessScore,
  qualityScore,
  suggestedStakeUnits,
  type QualityResult,
} from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { valueBetsGauge } from '../../common/metrics';
import { PublicationPolicyService } from '../model-metrics/publication-policy.service';

const LOW_LIQUIDITY = new Set(['OU_CORNERS', 'OU_CARDS', 'CS', 'EH', '1X2_H1', 'OU_GOALS_H1']);

export interface ValueCandidate {
  fixtureId: string;
  predictionRunId: string;
  marketKey: string;
  selectionKey: string;
  line: number | null;
  lineKey: string;
  probability: number;
  marketProbability: number;
  bestPrice: number;
  bestBookmakerSlug: string;
  bestSnapshotId: string;
  bookmakerCount: number;
  edge: number;
  expectedValue: number;
  fairOdds: number;
  confidence: number;
  quality: QualityResult;
  freshness: number;
  stakeUnits: number;
  passes: boolean;
  rejectReasons: string[];
}

export interface ValueBetQuery {
  sport?: string;
  leagueId?: string;
  market?: string;
  minEdge?: number;
  minEv?: number;
  minConfidence?: number;
  minOdds?: number;
  maxOdds?: number;
  from?: Date;
  to?: Date;
  sort?: 'quality' | 'edge' | 'ev' | 'kickoff';
  page: number;
  limit: number;
}

@Injectable()
export class ValueBetsService {
  private readonly logger = new Logger(ValueBetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PublicationPolicyService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** Evalúa todas las selecciones de una corrida contra las cuotas vigentes. Puro cálculo, sin escribir. */
  async evaluateRun(runId: string, now = new Date()): Promise<ValueCandidate[]> {
    const run = await this.prisma.predictionRun.findUniqueOrThrow({
      where: { id: runId },
      include: { probabilities: true, fixture: { select: { id: true, kickoff: true, lineupsConfirmed: true } } },
    });
    const quotes = await this.prisma.oddsQuote.findMany({
      where: { fixtureId: run.fixtureId, isLive: false, isSuspended: false, bookmaker: { isAuthorized: true, isActive: true } },
      include: { bookmaker: { select: { slug: true } } },
    });
    const minutesToKickoff = (run.fixture.kickoff.getTime() - now.getTime()) / 60_000;
    const staleSeconds = this.env.PREMATCH_ODDS_STALE_SECONDS;
    const out: ValueCandidate[] = [];

    for (const p of run.probabilities) {
      const pub = await this.policy.isPublished(run.modelVersion, 'FOOTBALL', p.marketKey);
      if (!pub.published) continue;
      const sel = quotes.filter((q) => q.marketKey === p.marketKey && q.selectionKey === p.selectionKey && q.lineKey === p.lineKey);
      const fresh = sel.filter((q) => (now.getTime() - q.lastSeenAt.getTime()) / 1000 < staleSeconds);
      if (fresh.length === 0) continue;
      const noVig = fresh.map((q) => q.impliedProbabilityNoVig).filter((x): x is number => x != null);
      if (noVig.length === 0) continue; // sin libro completo no hay referencia honesta de mercado
      const marketProbability = noVig.reduce((a, b) => a + b, 0) / noVig.length;
      const best = [...fresh].sort((a, b) => b.currentPrice - a.currentPrice)[0];
      const factors = p.factors as { distribution?: { push?: number } };
      const push = factors.distribution?.push ?? 0;
      const probability = p.calibratedProbability;
      const edge = probability - marketProbability;
      const expectedValue = (1 - push) * (probability * best.currentPrice - 1);
      const ageSeconds = (now.getTime() - best.lastSeenAt.getTime()) / 1000;
      const freshness = freshnessScore(ageSeconds, { freshSeconds: PREMATCH_FRESHNESS.freshSeconds, staleSeconds });
      const calibrationQuality = p.isCalibrated && pub.ece != null ? Math.max(0, 1 - pub.ece / 0.1) : 0.5;
      const quality = qualityScore({
        edge,
        expectedValue,
        calibrationQuality,
        freshness,
        bookmakerCount: fresh.length,
        uncertaintyWidth: p.uncertaintyUpper - p.uncertaintyLower,
        lineupsKnown: run.fixture.lineupsConfirmed,
        minutesToKickoff,
        lowLiquidityMarket: LOW_LIQUIDITY.has(p.marketKey),
        priceMoveFromOpening: best.currentPrice / best.openingPrice - 1,
        dataQuality: run.dataQuality ?? 0.5,
      });
      const reasons: string[] = [];
      if (edge < this.env.VALUE_MIN_EDGE) reasons.push('edge bajo el umbral');
      if (expectedValue < this.env.VALUE_MIN_EV) reasons.push('EV bajo el umbral');
      if (quality.score < this.env.VALUE_MIN_QUALITY) reasons.push('calidad insuficiente');
      if (fresh.length < this.env.VALUE_MIN_BOOKMAKERS) reasons.push('cobertura de casas insuficiente');
      if (p.confidence < this.env.VALUE_MIN_CONFIDENCE) reasons.push('confianza baja');
      if (best.currentPrice > this.env.VALUE_MAX_ODDS) reasons.push('cuota por encima del máximo');
      if (minutesToKickoff <= 0) reasons.push('partido iniciado');
      out.push({
        fixtureId: run.fixtureId,
        predictionRunId: run.id,
        marketKey: p.marketKey,
        selectionKey: p.selectionKey,
        line: p.line,
        lineKey: p.lineKey,
        probability,
        marketProbability,
        bestPrice: best.currentPrice,
        bestBookmakerSlug: best.bookmaker.slug,
        bestSnapshotId: best.currentSnapshotId,
        bookmakerCount: fresh.length,
        edge,
        expectedValue,
        fairOdds: p.fairOdds,
        confidence: p.confidence,
        quality,
        freshness,
        stakeUnits: suggestedStakeUnits(probability, best.currentPrice),
        passes: reasons.length === 0,
        rejectReasons: reasons,
      });
    }
    return out;
  }

  /**
   * compute:value-bets. Publica, reconfirma o retira oportunidades. La primera
   * publicación fija precio y métricas (inmutables para el historial).
   */
  async computeAll(now = new Date()): Promise<{ evaluated: number; published: number; reconfirmed: number; withdrawn: number }> {
    const runs = await this.prisma.predictionRun.findMany({
      where: { status: 'COMPLETED', modelVersion: FOOTBALL_MODEL_VERSION, fixture: { status: 'SCHEDULED', kickoff: { gt: now } } },
      select: { id: true, fixtureId: true, fixture: { select: { kickoff: true } } },
    });
    let evaluated = 0;
    let published = 0;
    let reconfirmed = 0;
    const passingKeys = new Set<string>();
    for (const run of runs) {
      const candidates = await this.evaluateRun(run.id, now);
      evaluated += candidates.length;
      for (const c of candidates.filter((x) => x.passes)) {
        const key = { fixtureId: c.fixtureId, marketKey: c.marketKey, selectionKey: c.selectionKey, lineKey: c.lineKey, isLive: false };
        passingKeys.add(JSON.stringify(key));
        const existing = await this.prisma.valueBet.findUnique({ where: { fixtureId_marketKey_selectionKey_lineKey_isLive: key } });
        if (existing) {
          await this.prisma.valueBet.update({
            where: { id: existing.id },
            data: { lastConfirmedAt: now, freshnessScore: c.freshness, ...(existing.status === 'WITHDRAWN' ? { status: 'ACTIVE', withdrawnAt: null, withdrawReason: null } : {}) },
          });
          reconfirmed += 1;
          continue;
        }
        const data: Prisma.ValueBetUncheckedCreateInput = {
          ...key,
          predictionRunId: c.predictionRunId,
          oddsSnapshotId: c.bestSnapshotId,
          line: c.line,
          bookmakerSlug: c.bestBookmakerSlug,
          price: c.bestPrice,
          probability: c.probability,
          marketProbability: c.marketProbability,
          fairOdds: c.fairOdds,
          edge: c.edge,
          expectedValue: c.expectedValue,
          confidence: c.confidence,
          qualityScore: c.quality.score,
          freshnessScore: c.freshness,
          penalties: c.quality.penalties as unknown as Prisma.InputJsonValue,
          recommendedStakeUnits: c.stakeUnits,
          detectedAt: now,
          lastConfirmedAt: now,
          expiresAt: run.fixture.kickoff,
        };
        await this.prisma.valueBet.create({ data });
        published += 1;
      }
    }
    const active = await this.prisma.valueBet.findMany({ where: { status: 'ACTIVE', isLive: false, fixture: { kickoff: { gt: now } } } });
    let withdrawn = 0;
    for (const vb of active) {
      const key = JSON.stringify({ fixtureId: vb.fixtureId, marketKey: vb.marketKey, selectionKey: vb.selectionKey, lineKey: vb.lineKey, isLive: false });
      if (passingKeys.has(key)) continue;
      await this.prisma.valueBet.update({ where: { id: vb.id }, data: { status: 'WITHDRAWN', withdrawnAt: now, withdrawReason: 'Ya no cumple los umbrales con las cuotas vigentes' } });
      withdrawn += 1;
    }
    valueBetsGauge.set(await this.prisma.valueBet.count({ where: { status: 'ACTIVE' } }));
    return { evaluated, published, reconfirmed, withdrawn };
  }

  async list(q: ValueBetQuery) {
    const now = new Date();
    const where: Prisma.ValueBetWhereInput = {
      status: 'ACTIVE',
      marketKey: q.market,
      edge: q.minEdge != null ? { gte: q.minEdge } : undefined,
      expectedValue: q.minEv != null ? { gte: q.minEv } : undefined,
      confidence: q.minConfidence != null ? { gte: q.minConfidence } : undefined,
      price: { gte: q.minOdds ?? undefined, lte: q.maxOdds ?? undefined },
      fixture: {
        kickoff: { gt: now, gte: q.from, lte: q.to },
        leagueId: q.leagueId,
        sport: q.sport ? { key: q.sport as never } : undefined,
      },
    };
    const orderBy: Prisma.ValueBetOrderByWithRelationInput =
      q.sort === 'edge' ? { edge: 'desc' } : q.sort === 'ev' ? { expectedValue: 'desc' } : q.sort === 'kickoff' ? { fixture: { kickoff: 'asc' } } : { qualityScore: 'desc' };
    const [items, total] = await Promise.all([
      this.prisma.valueBet.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          fixture: { include: { homeTeam: true, awayTeam: true, league: true, sport: true } },
          oddsSnapshot: { select: { capturedAt: true, sourceTimestamp: true, directBetUrl: true } },
          predictionRun: { select: { modelVersion: true, dataCutoff: true, generatedAt: true } },
        },
      }),
      this.prisma.valueBet.count({ where }),
    ]);
    const enriched = await Promise.all(items.map((vb) => this.enrich(vb)));
    return { items: enriched, meta: { total, page: q.page, limit: q.limit } };
  }

  /** Añade comparación vigente, movimiento desde apertura, explicación y riesgos. */
  private async enrich<T extends { id: string; fixtureId: string; marketKey: string; selectionKey: string; lineKey: string; predictionRunId: string; penalties: Prisma.JsonValue }>(vb: T) {
    const [quotes, prob] = await Promise.all([
      this.prisma.oddsQuote.findMany({
        where: { fixtureId: vb.fixtureId, marketKey: vb.marketKey, selectionKey: vb.selectionKey, lineKey: vb.lineKey, isLive: false, bookmaker: { isAuthorized: true, isActive: true } },
        include: { bookmaker: { select: { slug: true, name: true, logoUrl: true } } },
        orderBy: { currentPrice: 'desc' },
      }),
      this.prisma.calculatedProbability.findFirst({
        where: { predictionRunId: vb.predictionRunId, marketKey: vb.marketKey, selectionKey: vb.selectionKey, lineKey: vb.lineKey },
        select: { explanation: true, factors: true, uncertaintyLower: true, uncertaintyUpper: true, confidenceLevel: true, rawProbability: true, isCalibrated: true },
      }),
    ]);
    const factors = (prob?.factors ?? {}) as { items?: unknown[]; confidenceReductions?: string[] };
    return {
      ...vb,
      comparison: quotes.map((q) => ({
        bookmaker: q.bookmaker,
        price: q.currentPrice,
        openingPrice: q.openingPrice,
        movementFromOpening: q.currentPrice / q.openingPrice - 1,
        isSuspended: q.isSuspended,
        updatedAt: q.lastSeenAt,
        directBetUrl: q.directBetUrl,
      })),
      explanation: prob?.explanation ?? null,
      factors: factors.items ?? [],
      risks: [
        ...((vb.penalties as Array<{ label: string }>) ?? []).map((p) => p.label),
        ...(factors.confidenceReductions ?? []),
        'Las cuotas pueden cambiar. Verifica la información directamente con el operador antes de tomar una decisión.',
      ],
      uncertainty: prob ? { lower: prob.uncertaintyLower, upper: prob.uncertaintyUpper } : null,
      confidenceLevel: prob?.confidenceLevel ?? null,
      isCalibrated: prob?.isCalibrated ?? false,
    };
  }
}
