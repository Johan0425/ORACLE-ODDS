import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, SportKey } from '@prisma/client';
import {
  FOOTBALL_MODEL_VERSION,
  accuracy,
  applyCalibrator,
  bettingMetrics,
  bootstrapInterval,
  brierScore,
  expectedCalibrationError,
  fitCalibrator,
  logLoss,
  oddsBucket,
  reliabilityCurve,
  type SettledBet,
} from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { bettingPerformance, modelQuality } from '../../common/metrics';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { PredictionsService } from '../predictions/predictions.service';
import { SettlementService } from '../settlement/settlement.service';

interface Sample {
  p: number;
  y: number;
  at: Date;
  leagueId: string;
}

const BACKTEST_DAYS = 365;
const MAX_BACKTEST_FIXTURES = 1500;
const CALIBRATION_SPLIT = 0.7;

@Injectable()
export class ModelMetricsService {
  private readonly logger = new Logger(ModelMetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly predictions: PredictionsService,
    private readonly settlement: SettlementService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /**
   * Backtest walk-forward: predice cada partido terminado del último año con
   * corte 1 h antes del inicio, usando solo datos anteriores. Idempotente por
   * hash de entradas.
   */
  async runBacktest(now = new Date()): Promise<{ targets: number; created: number }> {
    const from = new Date(now.getTime() - (BACKTEST_DAYS + 730) * 86_400_000);
    const history = await this.predictions.loadHistory('FOOTBALL', from, now);
    const targetsFrom = now.getTime() - BACKTEST_DAYS * 86_400_000;
    const targets = history.filter((m) => m.kickoff.getTime() >= targetsFrom).slice(-MAX_BACKTEST_FIXTURES);
    let created = 0;
    for (const t of targets) {
      const r = await this.predictions.predictAndStore(t.fixtureId, {
        cutoff: new Date(t.kickoff.getTime() - 60 * 60_000),
        status: 'BACKTEST',
        history,
      });
      if (r?.created) created += 1;
    }
    await this.settlement.settlePending();
    return { targets: targets.length, created };
  }

  private async backtestSamples(modelVersion: string): Promise<Map<string, Sample[]>> {
    const rows = await this.prisma.calculatedProbability.findMany({
      where: { outcome: { in: ['WIN', 'LOSS'] }, predictionRun: { status: 'BACKTEST', modelVersion } },
      select: { marketKey: true, rawProbability: true, outcome: true, predictionRun: { select: { fixture: { select: { kickoff: true, leagueId: true } } } } },
    });
    const byMarket = new Map<string, Sample[]>();
    for (const r of rows) {
      const list = byMarket.get(r.marketKey) ?? [];
      list.push({ p: r.rawProbability, y: r.outcome === 'WIN' ? 1 : 0, at: r.predictionRun.fixture.kickoff, leagueId: r.predictionRun.fixture.leagueId });
      byMarket.set(r.marketKey, list);
    }
    for (const list of byMarket.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());
    return byMarket;
  }

  /**
   * Ajusta calibradores por mercado sobre la parte antigua de la muestra y los
   * evalúa en la parte reciente (fuera de muestra). Publica el mercado solo si
   * la muestra es suficiente, el ECE calibrado es bajo y supera al baseline.
   */
  async calibrateAndEvaluate(modelVersion = FOOTBALL_MODEL_VERSION, sportKey: SportKey = 'FOOTBALL') {
    const samples = await this.backtestSamples(modelVersion);
    const summary: Array<{ market: string; n: number; publishable: boolean; ece: number | null }> = [];
    for (const [market, list] of samples) {
      const split = Math.floor(list.length * CALIBRATION_SPLIT);
      const cal = list.slice(0, split);
      const test = list.slice(split);
      const calibrator = fitCalibrator(cal.map((s) => s.p), cal.map((s) => s.y));
      const testRaw = test.map((s) => s.p);
      const testCal = test.map((s) => applyCalibrator(calibrator, s.p));
      const ys = test.map((s) => s.y);
      const baseRate = cal.length ? cal.reduce((a, s) => a + s.y, 0) / cal.length : 0.5;
      const brierCal = test.length ? brierScore(testCal, ys) : null;
      const brierBase = test.length ? brierScore(test.map(() => baseRate), ys) : null;
      const ece = test.length ? expectedCalibrationError(testCal, ys) : null;
      const publishable =
        list.length >= this.env.CALIBRATION_MIN_SAMPLES &&
        ece != null &&
        ece <= this.env.CALIBRATION_MAX_ECE &&
        brierCal != null &&
        brierBase != null &&
        brierCal < brierBase;

      // Calibrador de producción: reajustado con toda la muestra tras validar.
      const deployed = fitCalibrator(list.map((s) => s.p), list.map((s) => s.y));
      await this.prisma.$transaction([
        this.prisma.calibrationModel.updateMany({ where: { modelVersion, sportKey, marketKey: market, isActive: true }, data: { isActive: false } }),
        this.prisma.calibrationModel.create({
          data: {
            modelVersion,
            sportKey,
            marketKey: market,
            method: deployed.method,
            params: deployed.params as Prisma.InputJsonValue,
            sampleSize: deployed.sampleSize,
            ece,
            trainedFrom: list[0]?.at ?? null,
            trainedTo: list[list.length - 1]?.at ?? null,
            isActive: true,
          },
        }),
      ]);
      await this.saveSnapshot({
        modelVersion,
        sportKey,
        marketKey: market,
        source: 'backtest',
        sampleSize: list.length,
        brier: brierCal,
        logLoss: test.length ? logLoss(testCal, ys) : null,
        ece,
        accuracy: test.length ? accuracy(testCal, ys) : null,
        calibrationCurve: test.length ? (reliabilityCurve(testCal, ys) as unknown as Prisma.InputJsonValue) : [],
        isPublishable: publishable,
        extra: { rawBrier: test.length ? brierScore(testRaw, ys) : null, baselineBrier: brierBase, testSize: test.length, calibrationMethod: calibrator.method },
      });
      // Por liga (solo métricas probabilísticas, sin decidir publicación).
      const byLeague = new Map<string, Sample[]>();
      for (const s of test) byLeague.set(s.leagueId, [...(byLeague.get(s.leagueId) ?? []), s]);
      for (const [leagueId, ls] of byLeague) {
        if (ls.length < 30) continue;
        const lp = ls.map((s) => applyCalibrator(calibrator, s.p));
        const ly = ls.map((s) => s.y);
        await this.saveSnapshot({ modelVersion, sportKey, marketKey: market, leagueId, source: 'backtest', sampleSize: ls.length, brier: brierScore(lp, ly), logLoss: logLoss(lp, ly), ece: expectedCalibrationError(lp, ly), accuracy: accuracy(lp, ly), calibrationCurve: [], isPublishable: false });
      }
      summary.push({ market, n: list.length, publishable, ece });
    }
    return summary;
  }

  /** Métricas reales de oportunidades publicadas y liquidadas (ROI, yield, CLV, drawdown, IC). */
  async liveBettingMetrics(modelVersion = FOOTBALL_MODEL_VERSION, sportKey: SportKey = 'FOOTBALL') {
    const bets = await this.prisma.valueBet.findMany({
      where: { result: { not: null }, predictionRun: { modelVersion }, fixture: { sport: { key: sportKey } } },
      select: { price: true, result: true, profitLossUnits: true, closingPrice: true, settledAt: true, marketKey: true, fixture: { select: { leagueId: true } } },
    });
    const toSettled = (b: (typeof bets)[number]): SettledBet => ({
      stake: 1,
      odds: b.price,
      profit: b.profitLossUnits ?? 0,
      outcome: b.result!,
      closingOdds: b.closingPrice,
      settledAt: b.settledAt ?? undefined,
    });
    const groups: Array<{ marketKey: string; leagueId: string; oddsBucket: string; list: typeof bets }> = [{ marketKey: '', leagueId: '', oddsBucket: '', list: bets }];
    const groupBy = (keyFn: (b: (typeof bets)[number]) => { marketKey: string; leagueId: string; oddsBucket: string }) => {
      const map = new Map<string, typeof bets>();
      for (const b of bets) {
        const k = JSON.stringify(keyFn(b));
        map.set(k, [...(map.get(k) ?? []), b]);
      }
      for (const [k, list] of map) groups.push({ ...JSON.parse(k), list });
    };
    groupBy((b) => ({ marketKey: b.marketKey, leagueId: '', oddsBucket: '' }));
    groupBy((b) => ({ marketKey: '', leagueId: b.fixture.leagueId, oddsBucket: '' }));
    groupBy((b) => ({ marketKey: '', leagueId: '', oddsBucket: oddsBucket(b.price) }));

    for (const g of groups) {
      const settled = g.list.map(toSettled);
      const m = bettingMetrics(settled);
      const nonVoid = settled.filter((s) => s.outcome !== 'VOID');
      const ci = bootstrapInterval(nonVoid, (s) => s.reduce((a, b) => a + b.profit, 0) / Math.max(1, s.reduce((a, b) => a + b.stake, 0)));
      await this.saveSnapshot({
        modelVersion,
        sportKey,
        marketKey: g.marketKey,
        leagueId: g.leagueId,
        oddsBucket: g.oddsBucket,
        source: 'live',
        sampleSize: m.bets,
        bets: m.bets,
        roi: m.roi,
        yieldPerBet: m.yieldPerBet,
        hitRate: m.hitRate,
        maxDrawdown: m.maxDrawdown,
        avgClv: m.avgClv,
        roiCiLower: ci?.lower ?? null,
        roiCiUpper: ci?.upper ?? null,
        calibrationCurve: [],
        isPublishable: false,
      });
    }

    // Calibración real: última predicción emitida antes del inicio de cada partido.
    const probs = await this.prisma.calculatedProbability.findMany({
      where: { outcome: { in: ['WIN', 'LOSS'] }, predictionRun: { modelVersion, status: { in: ['COMPLETED', 'SUPERSEDED'] } } },
      select: { marketKey: true, calibratedProbability: true, outcome: true, predictionRun: { select: { fixtureId: true, generatedAt: true, fixture: { select: { kickoff: true } } } } },
    });
    const latestRun = new Map<string, Date>();
    for (const p of probs) {
      if (p.predictionRun.generatedAt > p.predictionRun.fixture.kickoff) continue;
      const cur = latestRun.get(p.predictionRun.fixtureId);
      if (!cur || p.predictionRun.generatedAt > cur) latestRun.set(p.predictionRun.fixtureId, p.predictionRun.generatedAt);
    }
    const byMarket = new Map<string, { p: number[]; y: number[] }>();
    for (const p of probs) {
      if (latestRun.get(p.predictionRun.fixtureId)?.getTime() !== p.predictionRun.generatedAt.getTime()) continue;
      const g = byMarket.get(p.marketKey) ?? { p: [], y: [] };
      g.p.push(p.calibratedProbability);
      g.y.push(p.outcome === 'WIN' ? 1 : 0);
      byMarket.set(p.marketKey, g);
    }
    for (const [market, g] of byMarket) {
      await this.saveSnapshot({
        modelVersion,
        sportKey,
        marketKey: market,
        source: 'live-calibration',
        sampleSize: g.p.length,
        brier: brierScore(g.p, g.y),
        logLoss: logLoss(g.p, g.y),
        ece: expectedCalibrationError(g.p, g.y),
        accuracy: accuracy(g.p, g.y),
        calibrationCurve: reliabilityCurve(g.p, g.y) as unknown as Prisma.InputJsonValue,
        isPublishable: false,
      });
    }
    return { bets: bets.length, markets: byMarket.size };
  }

  private async saveSnapshot(s: {
    modelVersion: string;
    sportKey: SportKey;
    marketKey?: string;
    leagueId?: string;
    oddsBucket?: string;
    source: string;
    sampleSize: number;
    brier?: number | null;
    logLoss?: number | null;
    ece?: number | null;
    accuracy?: number | null;
    bets?: number;
    roi?: number | null;
    yieldPerBet?: number | null;
    hitRate?: number | null;
    maxDrawdown?: number | null;
    avgClv?: number | null;
    roiCiLower?: number | null;
    roiCiUpper?: number | null;
    calibrationCurve: Prisma.InputJsonValue;
    isPublishable: boolean;
    extra?: Record<string, unknown>;
  }) {
    const { extra, ...rest } = s;
    if (!s.leagueId && !s.oddsBucket) {
      for (const [metric, value] of [['brier', s.brier], ['log_loss', s.logLoss], ['ece', s.ece]] as const) {
        if (value != null && s.marketKey) modelQuality.set({ market: s.marketKey, source: s.source, metric }, value);
      }
      if (s.source === 'live' && !s.marketKey) {
        for (const [metric, value] of [['roi', s.roi], ['clv', s.avgClv], ['max_drawdown', s.maxDrawdown], ['bets', s.bets]] as const) {
          if (value != null) bettingPerformance.set({ metric }, value);
        }
      }
    }
    const key = { modelVersion: s.modelVersion, sportKey: s.sportKey, leagueId: s.leagueId ?? '', marketKey: s.marketKey ?? '', oddsBucket: s.oddsBucket ?? '', source: s.source };
    const curve = extra ? ({ bins: s.calibrationCurve, ...extra } as Prisma.InputJsonValue) : s.calibrationCurve;
    const data = { ...rest, ...key, calibrationCurve: curve, computedAt: new Date() };
    await this.prisma.modelMetricSnapshot.upsert({
      where: { modelVersion_sportKey_leagueId_marketKey_oddsBucket_source: key },
      create: data,
      update: data,
    });
  }

  async computeAll() {
    const backtest = await this.runBacktest();
    const calibration = await this.calibrateAndEvaluate();
    const live = await this.liveBettingMetrics();
    return { backtest, calibration, live };
  }

  async publicMetrics(modelVersion = FOOTBALL_MODEL_VERSION) {
    const rows = await this.prisma.modelMetricSnapshot.findMany({ where: { modelVersion }, orderBy: [{ source: 'asc' }, { marketKey: 'asc' }] });
    const leagueIds = [...new Set(rows.map((r) => r.leagueId).filter(Boolean))];
    const leagues = await this.prisma.league.findMany({ where: { id: { in: leagueIds } }, select: { id: true, name: true } });
    const leagueName = new Map(leagues.map((l) => [l.id, l.name]));
    return {
      modelVersion,
      thresholds: { minSamples: this.env.CALIBRATION_MIN_SAMPLES, maxEce: this.env.CALIBRATION_MAX_ECE },
      snapshots: rows.map((r) => ({ ...r, leagueName: r.leagueId ? (leagueName.get(r.leagueId) ?? null) : null })),
    };
  }
}
