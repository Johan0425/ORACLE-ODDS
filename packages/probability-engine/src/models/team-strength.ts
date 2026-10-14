/**
 * Fuerzas de ataque/defensa separadas por condición (local/visitante), con
 * decaimiento temporal y contracción bayesiana hacia el promedio de liga. Todas
 * las entradas deben ser anteriores a `cutoff`.
 */

export interface HistoricalMatch {
  kickoff: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
  /** xG solo si el proveedor lo suministra; nunca se estima aquí. */
  homeXg?: number | null;
  awayXg?: number | null;
  htHomeGoals?: number | null;
  htAwayGoals?: number | null;
  homeCorners?: number | null;
  awayCorners?: number | null;
  homeCards?: number | null;
  awayCards?: number | null;
}

export interface StrengthOptions {
  halfLifeDays: number;
  /** Peso del prior (en "partidos equivalentes") hacia el promedio de liga. */
  priorWeight: number;
  /** Peso del xG frente a goles reales cuando el xG existe. */
  xgWeight: number;
}

export const DEFAULT_STRENGTH: StrengthOptions = { halfLifeDays: 180, priorWeight: 4, xgWeight: 0.6 };

export interface LeagueAverages {
  homeGoals: number;
  awayGoals: number;
  sampleSize: number;
}

export interface VenueRates {
  scored: number;
  conceded: number;
  /** Suma de pesos temporales (tamaño efectivo de muestra). */
  effectiveN: number;
  rawN: number;
}

export interface TeamStrength {
  teamId: string;
  home: VenueRates;
  away: VenueRates;
  /** Goles reales − xG ponderado (positivo = sobrerrendimiento) cuando hay xG. */
  finishingDelta: number | null;
}

export function decayWeight(ageDays: number, halfLifeDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / halfLifeDays);
}

export function assertBeforeCutoff(matches: HistoricalMatch[], cutoff: Date): void {
  const leak = matches.find((m) => m.kickoff.getTime() >= cutoff.getTime());
  if (leak) throw new Error(`Fuga de datos: partido ${leak.kickoff.toISOString()} no es anterior al corte ${cutoff.toISOString()}`);
}

export function leagueAverages(matches: HistoricalMatch[], cutoff: Date, halfLifeDays = DEFAULT_STRENGTH.halfLifeDays): LeagueAverages {
  assertBeforeCutoff(matches, cutoff);
  let wSum = 0;
  let home = 0;
  let away = 0;
  for (const m of matches) {
    const w = decayWeight((cutoff.getTime() - m.kickoff.getTime()) / 86_400_000, halfLifeDays);
    wSum += w;
    home += w * m.homeGoals;
    away += w * m.awayGoals;
  }
  // Prior de fútbol europeo (≈ 10 partidos equivalentes): evita promedios 0 o extremos con muestras chicas.
  const priorW = 10;
  const PRIOR = { home: 1.5, away: 1.15 };
  if (wSum === 0) return { homeGoals: PRIOR.home, awayGoals: PRIOR.away, sampleSize: 0 };
  return {
    homeGoals: (home + priorW * PRIOR.home) / (wSum + priorW),
    awayGoals: (away + priorW * PRIOR.away) / (wSum + priorW),
    sampleSize: matches.length,
  };
}

function blendGoals(goals: number, xg: number | null | undefined, xgWeight: number): number {
  return xg == null ? goals : xgWeight * xg + (1 - xgWeight) * goals;
}

export function computeTeamStrength(
  teamId: string,
  matches: HistoricalMatch[],
  league: LeagueAverages,
  cutoff: Date,
  options: Partial<StrengthOptions> = {},
): TeamStrength {
  const opts = { ...DEFAULT_STRENGTH, ...options };
  assertBeforeCutoff(matches, cutoff);
  const acc = {
    home: { w: 0, scored: 0, conceded: 0, n: 0 },
    away: { w: 0, scored: 0, conceded: 0, n: 0 },
  };
  let goalsMinusXg = 0;
  let xgWeightSum = 0;

  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    if (!isHome && m.awayTeamId !== teamId) continue;
    const w = decayWeight((cutoff.getTime() - m.kickoff.getTime()) / 86_400_000, opts.halfLifeDays);
    const bucket = isHome ? acc.home : acc.away;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const xgf = isHome ? m.homeXg : m.awayXg;
    const xga = isHome ? m.awayXg : m.homeXg;
    bucket.w += w;
    bucket.n += 1;
    bucket.scored += w * blendGoals(gf, xgf, opts.xgWeight);
    bucket.conceded += w * blendGoals(ga, xga, opts.xgWeight);
    if (xgf != null) {
      goalsMinusXg += w * (gf - xgf);
      xgWeightSum += w;
    }
  }

  const k = opts.priorWeight;
  return {
    teamId,
    home: {
      scored: (acc.home.scored + k * league.homeGoals) / (acc.home.w + k),
      conceded: (acc.home.conceded + k * league.awayGoals) / (acc.home.w + k),
      effectiveN: acc.home.w,
      rawN: acc.home.n,
    },
    away: {
      scored: (acc.away.scored + k * league.awayGoals) / (acc.away.w + k),
      conceded: (acc.away.conceded + k * league.homeGoals) / (acc.away.w + k),
      effectiveN: acc.away.w,
      rawN: acc.away.n,
    },
    finishingDelta: xgWeightSum > 0 ? goalsMinusXg / xgWeightSum : null,
  };
}

/**
 * λ esperados del partido: ataque del local en casa × defensa del visitante
 * fuera, relativo al promedio de liga (modelo multiplicativo de Maher/Dixon-Coles).
 */
export function expectedGoalsFromStrengths(home: TeamStrength, away: TeamStrength, league: LeagueAverages): { home: number; away: number } {
  const homeAttack = home.home.scored / league.homeGoals;
  const awayDefense = away.away.conceded / league.homeGoals;
  const awayAttack = away.away.scored / league.awayGoals;
  const homeDefense = home.home.conceded / league.awayGoals;
  return {
    home: league.homeGoals * homeAttack * awayDefense,
    away: league.awayGoals * awayAttack * homeDefense,
  };
}

export interface ContextAdjustments {
  homeRestDays?: number | null;
  awayRestDays?: number | null;
  /** Partidos jugados en los últimos 14 días. */
  homeMatchesLast14?: number | null;
  awayMatchesLast14?: number | null;
  /** Ausencias confirmadas (lesión/sanción) de titulares habituales. */
  homeConfirmedAbsences?: number | null;
  awayConfirmedAbsences?: number | null;
  /** Rating relativo de la liga de cada equipo (1 = misma fuerza). Solo difiere en copas/internacionales. */
  homeLeagueStrength?: number | null;
  awayLeagueStrength?: number | null;
}

export interface AppliedAdjustment {
  code: string;
  label: string;
  side: 'home' | 'away';
  attackFactor: number;
  defenseFactor: number;
}

/**
 * Ajustes contextuales pequeños y acotados. Los factores son conservadores a
 * propósito; su magnitud real se valida en el backtest (docs/model-validation.md).
 */
export function contextAdjustments(ctx: ContextAdjustments): AppliedAdjustment[] {
  const out: AppliedAdjustment[] = [];
  for (const side of ['home', 'away'] as const) {
    const rest = side === 'home' ? ctx.homeRestDays : ctx.awayRestDays;
    const congestion = side === 'home' ? ctx.homeMatchesLast14 : ctx.awayMatchesLast14;
    const absences = side === 'home' ? ctx.homeConfirmedAbsences : ctx.awayConfirmedAbsences;
    if (rest != null && rest < 3) out.push({ code: 'SHORT_REST', label: `Descanso corto (${rest} días)`, side, attackFactor: 0.96, defenseFactor: 1.03 });
    if (congestion != null && congestion >= 4) out.push({ code: 'CONGESTION', label: `${congestion} partidos en 14 días`, side, attackFactor: 0.97, defenseFactor: 1.02 });
    if (absences != null && absences > 0) {
      const impact = Math.min(0.12, 0.03 * absences);
      out.push({ code: 'ABSENCES', label: `${absences} ausencias confirmadas`, side, attackFactor: 1 - impact, defenseFactor: 1 + impact / 2 });
    }
  }
  const hs = ctx.homeLeagueStrength ?? 1;
  const as = ctx.awayLeagueStrength ?? 1;
  if (Math.abs(hs - as) > 0.01) {
    const ratio = Math.sqrt(hs / as);
    out.push({ code: 'LEAGUE_STRENGTH', label: 'Diferencia de nivel entre ligas', side: 'home', attackFactor: ratio, defenseFactor: 1 / ratio });
  }
  return out;
}

export function applyAdjustments(lambdas: { home: number; away: number }, adjustments: AppliedAdjustment[]): { home: number; away: number } {
  let home = lambdas.home;
  let away = lambdas.away;
  for (const a of adjustments) {
    if (a.side === 'home') {
      home *= a.attackFactor;
      away *= a.defenseFactor;
    } else {
      away *= a.attackFactor;
      home *= a.defenseFactor;
    }
  }
  return { home, away };
}

/** Promedio ponderado por recencia de un conteo (córners/tarjetas) para un equipo; null si no hay datos. */
export function weightedCountRate(
  teamId: string,
  matches: HistoricalMatch[],
  cutoff: Date,
  pick: (m: HistoricalMatch, isHome: boolean) => number | null | undefined,
  halfLifeDays = DEFAULT_STRENGTH.halfLifeDays,
): { rate: number; n: number } | null {
  let w = 0;
  let sum = 0;
  let n = 0;
  for (const m of matches) {
    const isHome = m.homeTeamId === teamId;
    if (!isHome && m.awayTeamId !== teamId) continue;
    const v = pick(m, isHome);
    if (v == null) continue;
    const weight = decayWeight((cutoff.getTime() - m.kickoff.getTime()) / 86_400_000, halfLifeDays);
    w += weight;
    sum += weight * v;
    n += 1;
  }
  return n === 0 ? null : { rate: sum / w, n };
}
