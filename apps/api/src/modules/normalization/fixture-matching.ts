import { nameSimilarity } from './names';

export interface MatchCandidate {
  id: string;
  sportKey: string;
  leagueId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: Date;
  originalKickoff?: Date | null;
  venue?: string | null;
  status: string;
}

export interface MatchQuery {
  sportKey: string;
  /** Si se conoce la competición canónica, restringe los candidatos. */
  leagueId?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  kickoff: Date;
  venue?: string | null;
}

export interface MatchResult {
  candidate: MatchCandidate;
  score: number;
  reasons: string[];
}

export const MIN_TEAM_SIMILARITY = 0.72;
export const MIN_MATCH_SCORE = 0.8;

/**
 * Puntúa candidatos de deduplicación. Requisitos duros: mismo deporte, misma
 * competición (si se conoce), ambos equipos similares en su rol local/visitante
 * y horario dentro de la tolerancia (contra el horario actual u original, para
 * absorber reprogramaciones). La sede suma, nunca resta.
 */
export function scoreCandidate(q: MatchQuery, c: MatchCandidate, toleranceMinutes: number): MatchResult | null {
  if (q.sportKey !== c.sportKey) return null;
  if (q.leagueId && q.leagueId !== c.leagueId) return null;
  const home = nameSimilarity(q.homeTeamName, c.homeTeamName);
  const away = nameSimilarity(q.awayTeamName, c.awayTeamName);
  if (home < MIN_TEAM_SIMILARITY || away < MIN_TEAM_SIMILARITY) return null;
  const diffs = [c.kickoff, c.originalKickoff].filter((d): d is Date => !!d).map((d) => Math.abs(d.getTime() - q.kickoff.getTime()) / 60_000);
  const minutes = Math.min(...diffs);
  const postponed = c.status === 'POSTPONED';
  // Un partido aplazado puede reaparecer con fecha nueva lejana: se amplía la ventana a 30 días solo en ese caso.
  const tolerance = postponed ? 30 * 24 * 60 : toleranceMinutes;
  if (minutes > tolerance) return null;
  const reasons = [`local ${home.toFixed(2)}`, `visitante ${away.toFixed(2)}`, `Δ ${Math.round(minutes)} min`];
  let score = (home + away) / 2 - (minutes / Math.max(tolerance, 1)) * 0.1;
  if (q.venue && c.venue && nameSimilarity(q.venue, c.venue) > 0.8) {
    score += 0.05;
    reasons.push('sede coincide');
  }
  return { candidate: c, score, reasons };
}

export function bestMatch(q: MatchQuery, candidates: MatchCandidate[], toleranceMinutes: number): MatchResult | null {
  const scored = candidates
    .map((c) => scoreCandidate(q, c, toleranceMinutes))
    .filter((r): r is MatchResult => r != null && r.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  // Ambigüedad (dos candidatos casi iguales): mejor no emparejar que emparejar mal.
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.02) return null;
  return scored[0];
}
