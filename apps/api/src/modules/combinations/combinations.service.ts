import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_DIXON_COLES_RHO,
  analyzeCombination,
  analyzeSystem,
  buildScoreMatrix,
  lineKey,
  type ComboLeg,
  type ScoreMatrix,
} from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { publicCode } from '../../common/hashing';
import { marketLabel, selectionLabel } from '../share/share.service';

export interface LegInput {
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  line?: number | null;
  /** Cuota que el usuario vio; se reemplaza por la vigente si existe. */
  odds?: number;
  bookmaker?: string;
}

const MAX_LEGS = 15;

@Injectable()
export class CombinationsService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Refresca cada selección: cuota vigente (mejor autorizada o de la casa indicada) y probabilidad del modelo. */
  private async refreshLeg(input: LegInput, idx: number): Promise<ComboLeg & { bookmaker: string | null; oddsRefreshed: boolean; fixtureLabel: string }> {
    const fixture = await this.prisma.fixture.findFirst({ where: { id: input.fixtureId, primaryProvider: { not: null } }, include: { homeTeam: true, awayTeam: true } });
    if (!fixture) throw new BadRequestException(`Partido ${input.fixtureId} no disponible`);
    const lk = lineKey(input.line);
    const quote = await this.prisma.oddsQuote.findFirst({
      where: {
        fixtureId: input.fixtureId,
        marketKey: input.marketKey,
        selectionKey: input.selectionKey,
        lineKey: lk,
        isLive: false,
        isSuspended: false,
        bookmaker: { isAuthorized: true, isActive: true, ...(input.bookmaker ? { slug: input.bookmaker } : {}) },
      },
      orderBy: { currentPrice: 'desc' },
      include: { bookmaker: true },
    });
    const prob = await this.prisma.calculatedProbability.findFirst({
      where: { marketKey: input.marketKey, selectionKey: input.selectionKey, lineKey: lk, predictionRun: { fixtureId: input.fixtureId, status: 'COMPLETED' } },
      select: { calibratedProbability: true },
    });
    const odds = quote?.currentPrice ?? input.odds;
    if (!odds || odds <= 1) throw new BadRequestException(`Sin cuota vigente para la selección ${idx + 1}`);
    const label = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} · ${marketLabel(input.marketKey)}: ${selectionLabel(input.marketKey, input.selectionKey, input.line ?? null, fixture.homeTeam.name, fixture.awayTeam.name)}`;
    return {
      id: `leg${idx + 1}`,
      fixtureId: input.fixtureId,
      marketKey: input.marketKey,
      selectionKey: input.selectionKey,
      line: input.line ?? null,
      odds,
      probability: prob?.calibratedProbability ?? null,
      kickoff: fixture.kickoff,
      oddsCapturedAt: quote?.lastSeenAt ?? null,
      label,
      bookmaker: quote?.bookmaker.slug ?? input.bookmaker ?? null,
      oddsRefreshed: !!quote,
      fixtureLabel: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    };
  }

  private async scoreMatrices(fixtureIds: string[]): Promise<Record<string, ScoreMatrix>> {
    const runs = await this.prisma.predictionRun.findMany({ where: { fixtureId: { in: fixtureIds }, status: 'COMPLETED', lambdaHome: { not: null }, lambdaAway: { not: null } } });
    return Object.fromEntries(runs.map((r) => [r.fixtureId, buildScoreMatrix(r.lambdaHome!, r.lambdaAway!, DEFAULT_DIXON_COLES_RHO)]));
  }

  async analyze(input: { legs: LegInput[]; systemSizes?: number[]; stakeUnits?: number; save?: boolean }) {
    if (!input.legs?.length) throw new BadRequestException('Agrega al menos una selección');
    if (input.legs.length > MAX_LEGS) throw new BadRequestException(`Máximo ${MAX_LEGS} selecciones`);
    const legs = await Promise.all(input.legs.map((l, i) => this.refreshLeg(l, i)));
    const sameFixture = legs.length !== new Set(legs.map((l) => l.fixtureId)).size;
    const matrices = sameFixture ? await this.scoreMatrices([...new Set(legs.map((l) => l.fixtureId))]) : {};
    const analysis = analyzeCombination(legs, { scoreMatrices: matrices, staleOddsSeconds: this.env.PREMATCH_ODDS_STALE_SECONDS });
    const stake = Math.min(Math.max(input.stakeUnits ?? 1, 0.1), 100);
    const singles = legs.map((l) => ({
      legId: l.id,
      label: l.label,
      odds: l.odds,
      probability: l.probability ?? null,
      potentialReturn: stake * l.odds,
      expectedValue: l.probability != null ? l.probability * l.odds - 1 : null,
    }));
    const independentLegs = new Set(legs.map((l) => l.fixtureId)).size === legs.length;
    const systems = (input.systemSizes ?? [])
      .filter((k) => k >= 2 && k < legs.length)
      .map((k) => ({ ...analyzeSystem(legs, k, stake), assumesIndependence: true, valid: independentLegs }));
    let publicCodeValue: string | null = null;
    if (input.save && !analysis.blocked) {
      publicCodeValue = publicCode(8);
      await this.prisma.combination.create({
        data: {
          publicCode: publicCodeValue,
          legs: legs.map((l) => ({ fixtureId: l.fixtureId, marketKey: l.marketKey, selectionKey: l.selectionKey, line: l.line, odds: l.odds, probability: l.probability, label: l.label, bookmaker: l.bookmaker })) as Prisma.InputJsonValue,
          combinedOdds: analysis.combinedOdds,
          naiveProbability: analysis.naiveProbability,
          adjustedProbability: analysis.adjustedProbability,
          correlationPenalty: analysis.correlationPenalty,
          expectedValue: analysis.expectedValue,
          riskLevel: analysis.riskLevel,
          systemType: input.systemSizes?.length ? input.systemSizes.map((k) => `${k}/${legs.length}`).join(',') : null,
          expiresAt: new Date(Math.min(...legs.map((l) => l.kickoff!.getTime()))),
        },
      });
    }
    return {
      legs: legs.map(({ kickoff, oddsCapturedAt, ...l }) => ({ ...l, kickoff, oddsCapturedAt })),
      analysis,
      stakeUnits: stake,
      potentialReturn: analysis.blocked ? 0 : stake * analysis.combinedOdds,
      singles,
      systems,
      publicCode: publicCodeValue,
      disclaimer: 'Simulación en unidades sin dinero real. Las cuotas pueden cambiar; ningún pronóstico garantiza un resultado.',
    };
  }

  async get(code: string) {
    return this.prisma.combination.findUnique({ where: { publicCode: code.toUpperCase() } });
  }
}
