import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PredictionRunStatus, SportKey } from '@prisma/client';
import {
  FOOTBALL_MODEL_VERSION,
  consensusNoVig,
  lineKey,
  predictFootballFixture,
  type FootballPrediction,
  type FootballPredictionInput,
  type HistoricalMatch,
  type MarketConsensusInput,
  type SerializedCalibrator,
} from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { stableHash } from '../../common/hashing';

export interface HistoryMatch extends HistoricalMatch {
  fixtureId: string;
  leagueId: string;
}

const HISTORY_DAYS = 730;
const DEFAULT_OU_LINES = [1.5, 2.5, 3.5];
const DEFAULT_AH_LINES = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];

@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);

  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Partidos finalizados con procedencia verificable (nunca datos de demo) en una ventana. */
  async loadHistory(sportKey: SportKey, from: Date, to: Date): Promise<HistoryMatch[]> {
    const rows = await this.prisma.fixture.findMany({
      where: {
        sport: { key: sportKey },
        status: 'FINISHED',
        primaryProvider: { not: null },
        homeScore: { not: null },
        awayScore: { not: null },
        kickoff: { gte: from, lt: to },
      },
      select: {
        id: true,
        leagueId: true,
        kickoff: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        htHomeScore: true,
        htAwayScore: true,
        stats: { select: { teamId: true, corners: true, yellowCards: true, redCards: true, expectedGoals: true } },
      },
      orderBy: { kickoff: 'asc' },
    });
    return rows.map((r) => {
      const hs = r.stats.find((s) => s.teamId === r.homeTeamId);
      const as = r.stats.find((s) => s.teamId === r.awayTeamId);
      const cards = (s?: { yellowCards: number | null; redCards: number | null }) =>
        s && (s.yellowCards != null || s.redCards != null) ? (s.yellowCards ?? 0) + (s.redCards ?? 0) : null;
      return {
        fixtureId: r.id,
        leagueId: r.leagueId,
        kickoff: r.kickoff,
        homeTeamId: r.homeTeamId,
        awayTeamId: r.awayTeamId,
        homeGoals: r.homeScore!,
        awayGoals: r.awayScore!,
        htHomeGoals: r.htHomeScore,
        htAwayGoals: r.htAwayScore,
        homeCorners: hs?.corners ?? null,
        awayCorners: as?.corners ?? null,
        homeCards: cards(hs),
        awayCards: cards(as),
        homeXg: hs?.expectedGoals ?? null,
        awayXg: as?.expectedGoals ?? null,
      };
    });
  }

  /** Consenso sin margen con cuotas capturadas hasta `cutoff` en casas autorizadas (sin cuotas en vivo). */
  async marketConsensusAt(fixtureId: string, cutoff: Date): Promise<{ consensus: MarketConsensusInput | null; ouLines: number[]; ahLines: number[] }> {
    const snaps = await this.prisma.oddsSnapshot.findMany({
      where: { fixtureId, isLive: false, capturedAt: { lte: cutoff }, bookmaker: { isAuthorized: true, isActive: true }, marketKey: { in: ['1X2', 'OU_GOALS', 'AH'] } },
      orderBy: { capturedAt: 'asc' },
      select: { bookmakerId: true, marketKey: true, selectionKey: true, line: true, lineKey: true, priceDecimal: true, capturedAt: true },
    });
    const latest = new Map<string, (typeof snaps)[number]>();
    for (const s of snaps) latest.set(`${s.bookmakerId}|${s.marketKey}|${s.lineKey}|${s.selectionKey}`, s);
    const all = [...latest.values()];
    const ouLines = [...new Set(all.filter((s) => s.marketKey === 'OU_GOALS' && s.line != null).map((s) => s.line!))];
    const ahLines = [...new Set(all.filter((s) => s.marketKey === 'AH' && s.line != null).map((s) => s.line!))];
    const oneXTwo = consensusNoVig(
      all.filter((s) => s.marketKey === '1X2').map((s) => ({ bookmaker: s.bookmakerId, selection: s.selectionKey, price: s.priceDecimal })),
      ['HOME', 'DRAW', 'AWAY'],
      this.env.VIG_METHOD,
    );
    const overUnder = ouLines.flatMap((line) => {
      const c = consensusNoVig(
        all.filter((s) => s.marketKey === 'OU_GOALS' && s.lineKey === lineKey(line)).map((s) => ({ bookmaker: s.bookmakerId, selection: s.selectionKey, price: s.priceDecimal })),
        ['OVER', 'UNDER'],
        this.env.VIG_METHOD,
      );
      return c ? [{ line, OVER: c.probabilities.OVER, UNDER: c.probabilities.UNDER }] : [];
    });
    const capturedAt = all.reduce<Date | null>((acc, s) => (!acc || s.capturedAt > acc ? s.capturedAt : acc), null);
    const consensus =
      oneXTwo || overUnder.length > 0
        ? {
            oneXTwo: oneXTwo ? { HOME: oneXTwo.probabilities.HOME, DRAW: oneXTwo.probabilities.DRAW, AWAY: oneXTwo.probabilities.AWAY } : null,
            overUnder,
            capturedAt,
          }
        : null;
    return { consensus, ouLines, ahLines };
  }

  async activeCalibrators(modelVersion: string, sportKey: SportKey): Promise<{ map: Record<string, SerializedCalibrator>; ids: string[] }> {
    const rows = await this.prisma.calibrationModel.findMany({ where: { modelVersion, sportKey, isActive: true }, orderBy: { createdAt: 'desc' } });
    const map: Record<string, SerializedCalibrator> = {};
    const ids: string[] = [];
    for (const r of rows) {
      if (map[r.marketKey]) continue;
      map[r.marketKey] = { method: r.method, params: r.params, sampleSize: r.sampleSize } as SerializedCalibrator;
      ids.push(r.id);
    }
    return { map, ids };
  }

  /** Construye la entrada del modelo usando solo datos anteriores a `cutoff`. */
  async buildInput(
    fixtureId: string,
    cutoff: Date,
    options: { history?: HistoryMatch[]; calibrators?: Record<string, SerializedCalibrator>; useMarket?: boolean } = {},
  ): Promise<{ input: FootballPredictionInput; hashParts: Record<string, unknown> }> {
    const f = await this.prisma.fixture.findUniqueOrThrow({
      where: { id: fixtureId },
      include: { homeTeam: true, awayTeam: true, injuries: { where: { status: 'out', reportedAt: { lte: cutoff } } } },
    });
    const from = new Date(cutoff.getTime() - HISTORY_DAYS * 86_400_000);
    const history = (options.history ?? (await this.loadHistory('FOOTBALL', from, cutoff))).filter(
      (m) => m.kickoff.getTime() < cutoff.getTime() && m.kickoff.getTime() >= from.getTime(),
    );
    const leagueMatches = history.filter((m) => m.leagueId === f.leagueId);
    const teamMatches = history.filter((m) => [f.homeTeamId, f.awayTeamId].includes(m.homeTeamId) || [f.homeTeamId, f.awayTeamId].includes(m.awayTeamId));
    const market = options.useMarket === false ? { consensus: null, ouLines: [], ahLines: [] } : await this.marketConsensusAt(fixtureId, cutoff);
    const absences = {
      home: f.injuries.filter((i) => i.teamId === f.homeTeamId).length,
      away: f.injuries.filter((i) => i.teamId === f.awayTeamId).length,
    };
    const lineups = f.lineupsConfirmed && f.updatedAt <= cutoff;
    const input: FootballPredictionInput = {
      fixtureId: f.id,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeTeamName: f.homeTeam.name,
      awayTeamName: f.awayTeam.name,
      kickoff: f.kickoff,
      dataCutoff: cutoff,
      leagueMatches,
      teamMatches,
      lineupsConfirmed: lineups,
      market: market.consensus,
      context: { homeConfirmedAbsences: absences.home, awayConfirmedAbsences: absences.away },
      calibrators: options.calibrators,
      lines: {
        overUnder: [...new Set([...DEFAULT_OU_LINES, ...market.ouLines])].sort((a, b) => a - b),
        asianHandicap: [...new Set([...DEFAULT_AH_LINES, ...market.ahLines])].sort((a, b) => a - b),
      },
    };
    const lastMatch = teamMatches[teamMatches.length - 1];
    return {
      input,
      hashParts: {
        fixtureId,
        kickoff: f.kickoff,
        historyCount: history.length,
        teamMatches: teamMatches.length,
        lastTeamMatch: lastMatch?.fixtureId ?? null,
        market: market.consensus,
        absences,
        lineups,
      },
    };
  }

  private toJson(p: FootballPrediction) {
    return JSON.parse(JSON.stringify(p.featureSnapshot)) as Prisma.InputJsonValue;
  }

  /**
   * Genera y persiste una predicción. Si ya existe una corrida con exactamente
   * las mismas entradas (hash) no crea otra.
   */
  async predictAndStore(
    fixtureId: string,
    opts: { cutoff?: Date; status?: PredictionRunStatus; history?: HistoryMatch[]; useMarket?: boolean } = {},
  ): Promise<{ runId: string; created: boolean } | null> {
    const cutoff = opts.cutoff ?? new Date();
    const status = opts.status ?? 'COMPLETED';
    const calibrators = status === 'BACKTEST' ? { map: {}, ids: [] } : await this.activeCalibrators(FOOTBALL_MODEL_VERSION, 'FOOTBALL');
    const { input, hashParts } = await this.buildInput(fixtureId, cutoff, { history: opts.history, calibrators: calibrators.map, useMarket: opts.useMarket });
    const inputHash = stableHash({ ...hashParts, calibrators: calibrators.ids, status, modelVersion: FOOTBALL_MODEL_VERSION });

    const existing = await this.prisma.predictionRun.findUnique({
      where: { fixtureId_modelVersion_inputHash: { fixtureId, modelVersion: FOOTBALL_MODEL_VERSION, inputHash } },
      select: { id: true, status: true },
    });
    if (existing) {
      // Las entradas volvieron a un estado ya calculado (p. ej. una cuota regresó): se reactiva esa corrida.
      if (status === 'COMPLETED' && existing.status === 'SUPERSEDED') {
        await this.prisma.$transaction([
          this.prisma.predictionRun.updateMany({ where: { fixtureId, status: 'COMPLETED' }, data: { status: 'SUPERSEDED' } }),
          this.prisma.predictionRun.update({ where: { id: existing.id }, data: { status: 'COMPLETED' } }),
        ]);
      }
      return { runId: existing.id, created: false };
    }

    let prediction: FootballPrediction;
    try {
      prediction = predictFootballFixture(input, cutoff);
    } catch (e) {
      this.logger.warn(`Predicción omitida para ${fixtureId}: ${(e as Error).message}`);
      return null;
    }

    const run = await this.prisma.$transaction(async (tx) => {
      if (status === 'COMPLETED') {
        await tx.predictionRun.updateMany({ where: { fixtureId, status: 'COMPLETED' }, data: { status: 'SUPERSEDED' } });
      }
      return tx.predictionRun.create({
        data: {
          fixtureId,
          modelVersion: prediction.modelVersion,
          dataCutoff: cutoff,
          generatedAt: new Date(),
          featureSnapshot: this.toJson(prediction),
          trainingWindow: JSON.parse(JSON.stringify(prediction.trainingWindow)),
          dataQuality: prediction.dataQuality,
          lambdaHome: prediction.lambdas.home,
          lambdaAway: prediction.lambdas.away,
          status,
          inputHash,
          probabilities: {
            create: prediction.selections.map((s) => ({
              marketKey: s.marketKey,
              selectionKey: s.selectionKey,
              line: s.line,
              lineKey: lineKey(s.line),
              rawProbability: s.rawProbability,
              calibratedProbability: s.calibratedProbability,
              isCalibrated: s.calibrated,
              confidence: s.confidence,
              confidenceLevel: s.confidenceLevel,
              uncertaintyLower: s.uncertaintyLower,
              uncertaintyUpper: s.uncertaintyUpper,
              fairOdds: s.fairOdds,
              explanation: s.explanation,
              factors: JSON.parse(JSON.stringify({ items: s.factors, distribution: s.distribution, confidenceReductions: prediction.confidenceReductions })),
            })),
          },
        },
      });
    });
    return { runId: run.id, created: true };
  }

  /** compute:predictions — partidos de fútbol próximos con procedencia real. */
  async computeUpcoming(daysAhead = 7): Promise<{ fixtures: number; created: number; unchanged: number; failed: number }> {
    const now = new Date();
    const fixtures = await this.prisma.fixture.findMany({
      where: { sport: { key: 'FOOTBALL' }, status: 'SCHEDULED', primaryProvider: { not: null }, kickoff: { gt: now, lte: new Date(now.getTime() + daysAhead * 86_400_000) } },
      select: { id: true },
      orderBy: { kickoff: 'asc' },
    });
    const history = await this.loadHistory('FOOTBALL', new Date(now.getTime() - HISTORY_DAYS * 86_400_000), now);
    let created = 0;
    let unchanged = 0;
    let failed = 0;
    for (const f of fixtures) {
      const r = await this.predictAndStore(f.id, { cutoff: now, history });
      if (!r) failed += 1;
      else if (r.created) created += 1;
      else unchanged += 1;
    }
    return { fixtures: fixtures.length, created, unchanged, failed };
  }
}
