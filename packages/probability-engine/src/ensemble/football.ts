import { buildScoreMatrix, DEFAULT_DIXON_COLES_RHO, type ScoreMatrix } from '../models/dixon-coles';
import { computeEloRatings, eloExpectedScore, eloToOneXTwo, DEFAULT_ELO } from '../models/elo';
import {
  applyAdjustments,
  assertBeforeCutoff,
  computeTeamStrength,
  contextAdjustments,
  decayWeight,
  DEFAULT_STRENGTH,
  expectedGoalsFromStrengths,
  leagueAverages,
  weightedCountRate,
  type AppliedAdjustment,
  type ContextAdjustments,
  type HistoricalMatch,
} from '../models/team-strength';
import {
  effectiveProbability,
  fairOddsFromDistribution,
  selectionDistributionFromMatrix,
  totalsDistribution,
  type OutcomeDistribution,
} from '../markets/distribution';
import { applyCalibrator, type SerializedCalibrator } from '../calibration/calibration';
import type { MarketKey } from '../markets/keys';

export const FOOTBALL_MODEL_VERSION = 'football-ensemble-1.0.1';

/** Hiperparámetros versionados junto al modelo: cualquier cambio exige nueva versión. */
export const FOOTBALL_MODEL_CONFIG = {
  version: FOOTBALL_MODEL_VERSION,
  strength: DEFAULT_STRENGTH,
  elo: DEFAULT_ELO,
  rho: DEFAULT_DIXON_COLES_RHO,
  weights: { dixonColes: 0.55, elo: 0.2, market: 0.25 },
  h2h: { minMatches: 3, maxEffect: 0.06, halfLifeDays: 730 },
  correctScore: { minTeamMatches: 20, minDataQuality: 0.8, minProbability: 0.03 },
  halves: { minLeagueMatchesWithHt: 50 },
  countMarkets: { minTeamMatches: 5 },
  uncertaintyZ: 1.645,
} as const;

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Factor {
  code: string;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  /** Para quién empuja el factor (HOME/AWAY/OVER/...) cuando aplica. */
  favours?: string;
  value?: number;
}

export interface MarketConsensusInput {
  oneXTwo?: { HOME: number; DRAW: number; AWAY: number } | null;
  overUnder?: Array<{ line: number; OVER: number; UNDER: number }>;
  /** Momento de la última cuota usada: debe ser anterior al corte de datos. */
  capturedAt?: Date | null;
}

export interface FootballPredictionInput {
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: Date;
  dataCutoff: Date;
  /** Partidos de la misma competición (liga) anteriores al corte. */
  leagueMatches: HistoricalMatch[];
  /** Partidos de ambos equipos en cualquier competición anteriores al corte (Elo, descanso, forma). */
  teamMatches: HistoricalMatch[];
  context?: ContextAdjustments;
  lineupsConfirmed?: boolean;
  market?: MarketConsensusInput | null;
  /** Calibradores por `${marketKey}` ajustados fuera de muestra. */
  calibrators?: Partial<Record<string, SerializedCalibrator>>;
  lines?: Partial<{ overUnder: number[]; asianHandicap: number[]; europeanHandicap: number[]; corners: number[]; cards: number[]; overUnderH1: number[] }>;
}

export interface PredictedSelection {
  marketKey: MarketKey;
  selectionKey: string;
  line: number | null;
  rawProbability: number;
  calibratedProbability: number;
  calibrated: boolean;
  uncertaintyLower: number;
  uncertaintyUpper: number;
  fairOdds: number;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  explanation: string;
  factors: Factor[];
  distribution: OutcomeDistribution;
}

export interface FootballPrediction {
  modelVersion: string;
  fixtureId: string;
  dataCutoff: Date;
  generatedAt: Date;
  lambdas: { home: number; away: number };
  dataQuality: number;
  confidenceReductions: string[];
  featureSnapshot: Record<string, unknown>;
  trainingWindow: { from: Date | null; to: Date; matches: number };
  selections: PredictedSelection[];
}

const DEFAULT_LINES = {
  overUnder: [1.5, 2.5, 3.5],
  asianHandicap: [-1.5, -1, -0.5, 0, 0.5, 1, 1.5],
  europeanHandicap: [-1, 1],
  corners: [8.5, 9.5, 10.5],
  cards: [3.5, 4.5, 5.5],
  overUnderH1: [0.5, 1.5],
};

/** Pooling log-lineal ponderado de distribuciones sobre las mismas clases. */
export function logLinearPool(components: Array<{ probs: number[]; weight: number }>): number[] {
  const active = components.filter((c) => c.weight > 0);
  const totalWeight = active.reduce((s, c) => s + c.weight, 0);
  const k = active[0].probs.length;
  const logs = Array.from({ length: k }, (_, i) =>
    active.reduce((s, c) => s + (c.weight / totalWeight) * Math.log(Math.max(c.probs[i], 1e-9)), 0),
  );
  const exps = logs.map(Math.exp);
  const sum = exps.reduce((s, x) => s + x, 0);
  return exps.map((x) => x / sum);
}

function binaryDist(pWin: number): OutcomeDistribution {
  return { win: pWin, halfWin: 0, push: 0, halfLoss: 0, loss: 1 - pWin };
}

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function restDays(teamId: string, matches: HistoricalMatch[], kickoff: Date): number | null {
  const last = matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .reduce<Date | null>((acc, m) => (!acc || m.kickoff > acc ? m.kickoff : acc), null);
  return last ? Math.floor((kickoff.getTime() - last.getTime()) / 86_400_000) : null;
}

function matchesInWindow(teamId: string, matches: HistoricalMatch[], kickoff: Date, days: number): number {
  const from = kickoff.getTime() - days * 86_400_000;
  return matches.filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.kickoff.getTime() >= from).length;
}

function h2hAdjustment(input: FootballPredictionInput, lambdas: { home: number; away: number }): { factor: number; n: number; residual: number } {
  const cfg = FOOTBALL_MODEL_CONFIG.h2h;
  const h2h = input.teamMatches.filter(
    (m) =>
      (m.homeTeamId === input.homeTeamId && m.awayTeamId === input.awayTeamId) ||
      (m.homeTeamId === input.awayTeamId && m.awayTeamId === input.homeTeamId),
  );
  if (h2h.length < cfg.minMatches) return { factor: 1, n: h2h.length, residual: 0 };
  let w = 0;
  let residual = 0;
  for (const m of h2h) {
    const weight = decayWeight((input.dataCutoff.getTime() - m.kickoff.getTime()) / 86_400_000, cfg.halfLifeDays);
    const gdForHome = m.homeTeamId === input.homeTeamId ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals;
    residual += weight * (gdForHome - (lambdas.home - lambdas.away));
    w += weight;
  }
  const avgResidual = w > 0 ? residual / w : 0;
  const factor = 1 + Math.max(-cfg.maxEffect, Math.min(cfg.maxEffect, 0.03 * avgResidual));
  return { factor, n: h2h.length, residual: avgResidual };
}

function confidenceFrom(width: number, dataQuality: number, calibrated: boolean): { value: number; level: ConfidenceLevel } {
  const value = Math.max(0, Math.min(1, (1 - width / 0.35) * (0.5 + 0.5 * dataQuality) * (calibrated ? 1 : 0.8)));
  return { value: Math.round(value * 1000) / 1000, level: value >= 0.7 ? 'HIGH' : value >= 0.45 ? 'MEDIUM' : 'LOW' };
}

/**
 * Predicción de fútbol versionada. Usa exclusivamente datos anteriores a
 * `dataCutoff` (lanza si detecta fuga) y devuelve probabilidades crudas y
 * calibradas, intervalo de incertidumbre, cuota justa y factores explicativos.
 */
export function predictFootballFixture(input: FootballPredictionInput, now: Date = new Date()): FootballPrediction {
  const cfg = FOOTBALL_MODEL_CONFIG;
  const lines = { ...DEFAULT_LINES, ...input.lines };
  const cutoff = input.dataCutoff;
  if (cutoff.getTime() > input.kickoff.getTime()) throw new Error('El corte de datos no puede ser posterior al inicio del partido');
  assertBeforeCutoff(input.leagueMatches, cutoff);
  assertBeforeCutoff(input.teamMatches, cutoff);
  if (input.market?.capturedAt && input.market.capturedAt.getTime() > cutoff.getTime()) {
    throw new Error('Fuga de datos: cuotas capturadas después del corte');
  }

  const league = leagueAverages(input.leagueMatches, cutoff);
  const allMatches = dedupeMatches([...input.leagueMatches, ...input.teamMatches]);
  const homeStrength = computeTeamStrength(input.homeTeamId, allMatches, league, cutoff);
  const awayStrength = computeTeamStrength(input.awayTeamId, allMatches, league, cutoff);
  const baseLambdas = expectedGoalsFromStrengths(homeStrength, awayStrength, league);

  const context: ContextAdjustments = {
    homeRestDays: restDays(input.homeTeamId, input.teamMatches, input.kickoff),
    awayRestDays: restDays(input.awayTeamId, input.teamMatches, input.kickoff),
    homeMatchesLast14: matchesInWindow(input.homeTeamId, input.teamMatches, input.kickoff, 14),
    awayMatchesLast14: matchesInWindow(input.awayTeamId, input.teamMatches, input.kickoff, 14),
    ...input.context,
  };
  const adjustments: AppliedAdjustment[] = contextAdjustments(context);
  let lambdas = applyAdjustments(baseLambdas, adjustments);
  const h2h = h2hAdjustment(input, lambdas);
  lambdas = { home: lambdas.home * h2h.factor, away: lambdas.away / h2h.factor };

  if (!Number.isFinite(lambdas.home) || !Number.isFinite(lambdas.away) || lambdas.home <= 0 || lambdas.away <= 0) {
    throw new Error(`Goles esperados no válidos (${lambdas.home}, ${lambdas.away}): datos insuficientes`);
  }
  const matrix = buildScoreMatrix(lambdas.home, lambdas.away, cfg.rho);

  // Elo sobre todos los partidos conocidos de ambos equipos y su liga.
  const elo = computeEloRatings(allMatches, cutoff);
  const homeElo = elo.get(input.homeTeamId);
  const awayElo = elo.get(input.awayTeamId);
  const eloExpected = eloExpectedScore(homeElo?.rating ?? cfg.elo.initialRating, awayElo?.rating ?? cfg.elo.initialRating);
  const elo1x2 = eloToOneXTwo(eloExpected);
  const eloReliable = (homeElo?.games ?? 0) >= 10 && (awayElo?.games ?? 0) >= 10;

  // Calidad de datos 0..1.
  const homeN = homeStrength.home.rawN + homeStrength.away.rawN;
  const awayN = awayStrength.home.rawN + awayStrength.away.rawN;
  const qualityParts = [
    Math.min(1, homeN / 15),
    Math.min(1, awayN / 15),
    Math.min(1, league.sampleSize / 60),
    eloReliable ? 1 : 0.5,
    input.lineupsConfirmed ? 1 : 0.85,
  ];
  const dataQuality = qualityParts.reduce((s, x) => s + x, 0) / qualityParts.length;

  const confidenceReductions: string[] = [];
  if (homeN < 10 || awayN < 10) confidenceReductions.push('Historial reciente corto para al menos un equipo');
  if (league.sampleSize < 30) confidenceReductions.push('Pocos partidos de la competición para estimar promedios de liga');
  if (!eloReliable) confidenceReductions.push('Rating Elo con pocos partidos: peso reducido');
  if (!input.lineupsConfirmed) confidenceReductions.push('Alineaciones no confirmadas');
  if (!input.market?.oneXTwo) confidenceReductions.push('Sin consenso de mercado disponible antes del corte');

  // Incertidumbre: error estándar relativo de una tasa Poisson = 1/√(goles esperados observados),
  // combinando la estimación de ataque de un equipo con la de defensa del rival (incluye el prior).
  const k = cfg.strength.priorWeight;
  const rateRelSe = (lambda: number, effectiveN: number) => 1 / Math.sqrt(Math.max(lambda, 0.2) * (effectiveN + k));
  const relHome = Math.hypot(rateRelSe(lambdas.home, homeStrength.home.effectiveN), rateRelSe(lambdas.home, awayStrength.away.effectiveN));
  const relAway = Math.hypot(rateRelSe(lambdas.away, awayStrength.away.effectiveN), rateRelSe(lambdas.away, homeStrength.home.effectiveN));
  // Las esquinas mueven ambos λ a la vez: z/√2 por eje mantiene la cobertura conjunta cercana al nivel declarado.
  const z = cfg.uncertaintyZ / Math.SQRT2;
  const cornerFactors = [
    [Math.exp(z * relHome), Math.exp(z * relAway)],
    [Math.exp(z * relHome), Math.exp(-z * relAway)],
    [Math.exp(-z * relHome), Math.exp(z * relAway)],
    [Math.exp(-z * relHome), Math.exp(-z * relAway)],
  ];
  const corners: ScoreMatrix[] = cornerFactors.map(([fh, fa]) => buildScoreMatrix(lambdas.home * fh, lambdas.away * fa, cfg.rho));

  const weights = {
    dc: cfg.weights.dixonColes,
    elo: eloReliable ? cfg.weights.elo : cfg.weights.elo / 2,
    market: input.market?.oneXTwo ? cfg.weights.market : 0,
  };
  const pool1x2 = (m: ScoreMatrix) => {
    const dc = (['HOME', 'DRAW', 'AWAY'] as const).map((s) => selectionDistributionFromMatrix(m, { marketKey: '1X2', selectionKey: s }).win);
    return logLinearPool([
      { probs: dc, weight: weights.dc },
      { probs: [elo1x2.home, elo1x2.draw, elo1x2.away], weight: weights.elo },
      ...(input.market?.oneXTwo ? [{ probs: [input.market.oneXTwo.HOME, input.market.oneXTwo.DRAW, input.market.oneXTwo.AWAY], weight: weights.market }] : []),
    ]);
  };

  const commonFactors = buildFactors(input, homeStrength, awayStrength, adjustments, h2h, homeElo?.rating, awayElo?.rating, eloReliable);
  const selections: PredictedSelection[] = [];

  const push = (
    marketKey: MarketKey,
    selectionKey: string,
    line: number | null,
    dist: OutcomeDistribution,
    envelope: number[],
    explanation: string,
    factors: Factor[] = commonFactors,
  ) => {
    const raw = effectiveProbability(dist);
    const calibrator = input.calibrators?.[marketKey];
    const calibrated = applyCalibrator(calibrator, raw);
    const isCalibrated = !!calibrator && calibrator.method !== 'identity';
    const shift = calibrated - raw;
    const lower = Math.max(0.001, Math.min(...envelope, raw) + shift);
    const upper = Math.min(0.999, Math.max(...envelope, raw) + shift);
    const conf = confidenceFrom(upper - lower, dataQuality, isCalibrated);
    selections.push({
      marketKey,
      selectionKey,
      line,
      rawProbability: round(raw),
      calibratedProbability: round(calibrated),
      calibrated: isCalibrated,
      uncertaintyLower: round(lower),
      uncertaintyUpper: round(upper),
      fairOdds: Math.round((1 / calibrated) * 100) / 100,
      confidence: conf.value,
      confidenceLevel: conf.level,
      explanation,
      factors,
      distribution: dist,
    });
  };

  // 1X2, doble oportunidad y empate no válido desde el ensemble.
  const p1x2 = pool1x2(matrix);
  const env1x2 = corners.map(pool1x2);
  const labels = { HOME: input.homeTeamName, DRAW: 'Empate', AWAY: input.awayTeamName } as const;
  (['HOME', 'DRAW', 'AWAY'] as const).forEach((s, i) => {
    push(
      '1X2',
      s,
      null,
      binaryDist(p1x2[i]),
      env1x2.map((e) => e[i]),
      `${labels[s]}: ${pct(p1x2[i])}. Goles esperados ${lambdas.home.toFixed(2)}–${lambdas.away.toFixed(2)} (Dixon-Coles), ` +
        `Elo ${Math.round(homeElo?.rating ?? 1500)}–${Math.round(awayElo?.rating ?? 1500)}` +
        (weights.market > 0 ? ', ponderado con el consenso de mercado sin margen.' : '.'),
    );
  });
  const dcPairs = [
    ['HOME_DRAW', 0, 1],
    ['HOME_AWAY', 0, 2],
    ['DRAW_AWAY', 1, 2],
  ] as const;
  for (const [key, a, b] of dcPairs) {
    push('DC', key, null, binaryDist(p1x2[a] + p1x2[b]), env1x2.map((e) => e[a] + e[b]), `Doble oportunidad ${key.replace('_', '/')}: ${pct(p1x2[a] + p1x2[b])}.`);
  }
  const dnbHome = p1x2[0] / (p1x2[0] + p1x2[2]);
  push('DNB', 'HOME', null, { win: p1x2[0], halfWin: 0, push: p1x2[1], halfLoss: 0, loss: p1x2[2] }, env1x2.map((e) => e[0] / (e[0] + e[2])), `Empate no válido, ${input.homeTeamName}: ${pct(dnbHome)} excluyendo el empate.`);
  push('DNB', 'AWAY', null, { win: p1x2[2], halfWin: 0, push: p1x2[1], halfLoss: 0, loss: p1x2[0] }, env1x2.map((e) => e[2] / (e[0] + e[2])), `Empate no válido, ${input.awayTeamName}: ${pct(1 - dnbHome)} excluyendo el empate.`);

  // Totales de goles: matriz, ponderada con el mercado cuando existe la misma línea.
  for (const line of lines.overUnder) {
    const over = selectionDistributionFromMatrix(matrix, { marketKey: 'OU_GOALS', selectionKey: 'OVER', line });
    const under = selectionDistributionFromMatrix(matrix, { marketKey: 'OU_GOALS', selectionKey: 'UNDER', line });
    const mkt = input.market?.overUnder?.find((o) => o.line === line);
    let pOver = effectiveProbability(over);
    if (mkt) pOver = logLinearPool([{ probs: [pOver, 1 - pOver], weight: 1 - cfg.weights.market }, { probs: [mkt.OVER, mkt.UNDER], weight: cfg.weights.market }])[0];
    const envOver = corners.map((m) => effectiveProbability(selectionDistributionFromMatrix(m, { marketKey: 'OU_GOALS', selectionKey: 'OVER', line })));
    const total = (lambdas.home + lambdas.away).toFixed(2);
    push('OU_GOALS', 'OVER', line, mkt ? binaryDist(pOver) : over, envOver, `Más de ${line} goles: ${pct(pOver)}. Total esperado ${total}.`);
    push('OU_GOALS', 'UNDER', line, mkt ? binaryDist(1 - pOver) : under, envOver.map((p) => 1 - p), `Menos de ${line} goles: ${pct(1 - pOver)}. Total esperado ${total}.`);
  }

  const btts = selectionDistributionFromMatrix(matrix, { marketKey: 'BTTS', selectionKey: 'YES' });
  const envBtts = corners.map((m) => selectionDistributionFromMatrix(m, { marketKey: 'BTTS', selectionKey: 'YES' }).win);
  push('BTTS', 'YES', null, btts, envBtts, `Ambos marcan: ${pct(btts.win)}. P(local marca) y P(visitante marca) desde la matriz de marcadores.`);
  push('BTTS', 'NO', null, binaryDist(1 - btts.win), envBtts.map((p) => 1 - p), `No marcan ambos: ${pct(1 - btts.win)}.`);

  for (const line of lines.asianHandicap) {
    for (const s of ['HOME', 'AWAY'] as const) {
      const dist = selectionDistributionFromMatrix(matrix, { marketKey: 'AH', selectionKey: s, line });
      const env = corners.map((m) => effectiveProbability(selectionDistributionFromMatrix(m, { marketKey: 'AH', selectionKey: s, line })));
      const shown = s === 'HOME' ? line : -line;
      push('AH', s, line, dist, env, `${s === 'HOME' ? input.homeTeamName : input.awayTeamName} ${shown > 0 ? '+' : ''}${shown} (asiático): ${pct(effectiveProbability(dist))} ajustado por push.`);
    }
  }

  for (const line of lines.europeanHandicap) {
    for (const s of ['HOME', 'DRAW', 'AWAY'] as const) {
      const dist = selectionDistributionFromMatrix(matrix, { marketKey: 'EH', selectionKey: s, line });
      const env = corners.map((m) => selectionDistributionFromMatrix(m, { marketKey: 'EH', selectionKey: s, line }).win);
      push('EH', s, line, dist, env, `Hándicap europeo ${line > 0 ? '+' : ''}${line} (local), ${labels[s]}: ${pct(dist.win)}.`);
    }
  }

  // Marcador correcto solo con soporte suficiente.
  const cs = cfg.correctScore;
  if (homeN >= cs.minTeamMatches && awayN >= cs.minTeamMatches && dataQuality >= cs.minDataQuality) {
    for (let i = 0; i <= 5; i++) {
      for (let j = 0; j <= 5; j++) {
        if (matrix[i][j] < cs.minProbability) continue;
        const env = corners.map((m) => m[i][j]);
        push('CS', `${i}-${j}`, null, binaryDist(matrix[i][j]), env, `Marcador ${i}-${j}: ${pct(matrix[i][j])}.`);
      }
    }
  } else {
    confidenceReductions.push('Marcador correcto omitido: soporte de datos insuficiente');
  }

  // Primera mitad solo si la liga trae marcadores al descanso.
  const withHt = input.leagueMatches.filter((m) => m.htHomeGoals != null && m.htAwayGoals != null);
  if (withHt.length >= cfg.halves.minLeagueMatchesWithHt) {
    const ftGoals = withHt.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0);
    const htGoals = withHt.reduce((s, m) => s + (m.htHomeGoals ?? 0) + (m.htAwayGoals ?? 0), 0);
    const share = ftGoals > 0 ? htGoals / ftGoals : 0.45;
    const h1 = buildScoreMatrix(lambdas.home * share, lambdas.away * share, 0);
    const h1Corners = cornerFactors.map(([fh, fa]) => buildScoreMatrix(lambdas.home * share * fh, lambdas.away * share * fa, 0));
    const winOf = (m: ScoreMatrix, marketKey: '1X2' | 'OU_GOALS', selectionKey: string, line?: number) =>
      selectionDistributionFromMatrix(m, { marketKey, selectionKey, line }).win;
    (['HOME', 'DRAW', 'AWAY'] as const).forEach((s) => {
      const p = winOf(h1, '1X2', s);
      push('1X2_H1', s, null, binaryDist(p), h1Corners.map((m) => winOf(m, '1X2', s)), `${labels[s]} al descanso: ${pct(p)}. ${(share * 100).toFixed(0)}% de los goles de la liga llegan en la 1.ª mitad.`);
    });
    for (const line of lines.overUnderH1) {
      const over = winOf(h1, 'OU_GOALS', 'OVER', line);
      const envOver = h1Corners.map((m) => winOf(m, 'OU_GOALS', 'OVER', line));
      push('OU_GOALS_H1', 'OVER', line, binaryDist(over), envOver, `Más de ${line} goles en la 1.ª mitad: ${pct(over)}.`);
      push('OU_GOALS_H1', 'UNDER', line, binaryDist(1 - over), envOver.map((p) => 1 - p), `Menos de ${line} goles en la 1.ª mitad: ${pct(1 - over)}.`);
    }
  }

  // Córners y tarjetas: solo si ambos equipos tienen historial de ese dato.
  const countMarket = (marketKey: 'OU_CORNERS' | 'OU_CARDS', label: string, pick: (m: HistoricalMatch, isHome: boolean) => number | null | undefined, marketLines: number[]) => {
    const h = weightedCountRate(input.homeTeamId, allMatches, cutoff, pick);
    const a = weightedCountRate(input.awayTeamId, allMatches, cutoff, pick);
    if (!h || !a || h.n < cfg.countMarkets.minTeamMatches || a.n < cfg.countMarkets.minTeamMatches) return;
    const lambda = h.rate + a.rate;
    const rel = Math.sqrt(1 / h.n + 1 / a.n) * 0.5;
    for (const line of marketLines) {
      for (const s of ['OVER', 'UNDER'] as const) {
        const dist = totalsDistribution(lambda, line, s);
        const env = [lambda * Math.exp(cfg.uncertaintyZ * rel), lambda * Math.exp(-cfg.uncertaintyZ * rel)].map((l) => effectiveProbability(totalsDistribution(l, line, s)));
        push(marketKey, s, line, dist, env, `${s === 'OVER' ? 'Más' : 'Menos'} de ${line} ${label}: ${pct(effectiveProbability(dist))}. Promedios recientes ${h.rate.toFixed(1)} y ${a.rate.toFixed(1)}.`, [
          ...commonFactors.filter((f) => f.code !== 'ELO_GAP'),
          { code: 'LOW_LIQUIDITY_MARKET', label: 'Mercado secundario con menor liquidez', direction: 'negative' },
        ]);
      }
    }
  };
  countMarket('OU_CORNERS', 'córners', (m, isHome) => (isHome ? m.homeCorners : m.awayCorners), lines.corners);
  countMarket('OU_CARDS', 'tarjetas', (m, isHome) => (isHome ? m.homeCards : m.awayCards), lines.cards);

  const sortedDates = allMatches.map((m) => m.kickoff.getTime()).sort((a, b) => a - b);
  return {
    modelVersion: FOOTBALL_MODEL_VERSION,
    fixtureId: input.fixtureId,
    dataCutoff: cutoff,
    generatedAt: now,
    lambdas: { home: round(lambdas.home), away: round(lambdas.away) },
    dataQuality: round(dataQuality),
    confidenceReductions,
    featureSnapshot: {
      league,
      homeStrength,
      awayStrength,
      baseLambdas,
      adjustments,
      h2h,
      elo: { home: homeElo ?? null, away: awayElo ?? null, expectedScore: eloExpected, oneXTwo: elo1x2, reliable: eloReliable },
      market: input.market ?? null,
      weights,
      lineupsConfirmed: !!input.lineupsConfirmed,
      config: FOOTBALL_MODEL_CONFIG,
    },
    trainingWindow: {
      from: sortedDates.length ? new Date(sortedDates[0]) : null,
      to: cutoff,
      matches: allMatches.length,
    },
    selections,
  };
}

function round(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function dedupeMatches(matches: HistoricalMatch[]): HistoricalMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.kickoff.getTime()}|${m.homeTeamId}|${m.awayTeamId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildFactors(
  input: FootballPredictionInput,
  home: ReturnType<typeof computeTeamStrength>,
  away: ReturnType<typeof computeTeamStrength>,
  adjustments: AppliedAdjustment[],
  h2h: { factor: number; n: number; residual: number },
  homeElo: number | undefined,
  awayElo: number | undefined,
  eloReliable: boolean,
): Factor[] {
  const factors: Factor[] = [];
  if (homeElo != null && awayElo != null && eloReliable) {
    const gap = Math.round(homeElo - awayElo);
    factors.push({
      code: 'ELO_GAP',
      label: `Diferencia Elo ${gap > 0 ? '+' : ''}${gap} a favor de ${gap >= 0 ? input.homeTeamName : input.awayTeamName}`,
      direction: Math.abs(gap) < 25 ? 'neutral' : 'positive',
      favours: gap >= 0 ? 'HOME' : 'AWAY',
      value: gap,
    });
  }
  factors.push({
    code: 'HOME_FORM',
    label: `${input.homeTeamName} como local: ${home.home.scored.toFixed(2)} a favor / ${home.home.conceded.toFixed(2)} en contra (ponderado)`,
    direction: home.home.scored > home.home.conceded ? 'positive' : 'negative',
    favours: 'HOME',
  });
  factors.push({
    code: 'AWAY_FORM',
    label: `${input.awayTeamName} como visitante: ${away.away.scored.toFixed(2)} a favor / ${away.away.conceded.toFixed(2)} en contra (ponderado)`,
    direction: away.away.scored > away.away.conceded ? 'positive' : 'negative',
    favours: 'AWAY',
  });
  for (const a of adjustments) {
    factors.push({ code: a.code, label: a.label, direction: 'negative', favours: a.side === 'home' ? 'AWAY' : 'HOME' });
  }
  if (h2h.n >= FOOTBALL_MODEL_CONFIG.h2h.minMatches && Math.abs(h2h.factor - 1) > 0.005) {
    factors.push({ code: 'H2H', label: `H2H (${h2h.n} partidos, peso bajo con decaimiento)`, direction: 'neutral', favours: h2h.factor > 1 ? 'HOME' : 'AWAY' });
  }
  for (const [team, s] of [
    [input.homeTeamName, home],
    [input.awayTeamName, away],
  ] as const) {
    if (s.finishingDelta != null && Math.abs(s.finishingDelta) > 0.25) {
      factors.push({
        code: 'XG_DELTA',
        label: `${team} ${s.finishingDelta > 0 ? 'sobrerrinde' : 'infrarrinde'} su xG en ${Math.abs(s.finishingDelta).toFixed(2)} goles/partido (riesgo de regresión)`,
        direction: 'negative',
      });
    }
  }
  return factors;
}
