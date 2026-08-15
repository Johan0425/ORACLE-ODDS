import type { ConfidenceLevel } from '@/components/match/MatchCard';

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3001/api/v1';

interface ApiEnvelope<T> {
  data: T;
}

export interface ApiTeamRef {
  id: string;
  name: string;
}

export interface ApiFixture {
  id: string;
  kickoff: string;
  status: string;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  league: { id: string; name: string };
  homeTeam: ApiTeamRef;
  awayTeam: ApiTeamRef;
}

interface ApiFixtureListResponse {
  items: ApiFixture[];
  meta: { total: number; page: number; limit: number };
}

export interface ApiProbability {
  market: string;
  selection: string;
  line: number | null;
  probability: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

export interface ApiTeamForm {
  fixtureId: string;
  kickoff: string;
  result: 'W' | 'D' | 'L';
  goalsFor: number;
  goalsAgainst: number;
}

export interface ApiTeamStats {
  sampleSize: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgCorners: number;
  avgCards: number;
}

export interface ApiH2HMatch {
  fixtureId: string;
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  totalGoals: number;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${path} respondió ${res.status}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

export function getFixtures(params: { status?: string; date?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.date) query.set('date', params.date);
  if (params.limit) query.set('limit', String(params.limit));
  return apiFetch<ApiFixtureListResponse>(`/fixtures?${query.toString()}`);
}

export function getFixtureDetail(fixtureId: string) {
  return apiFetch<ApiFixture>(`/fixtures/${fixtureId}`);
}

export function getFixtureProbabilities(fixtureId: string) {
  return apiFetch<ApiProbability[]>(`/fixtures/${fixtureId}/probabilities`);
}

export function getTeamForm(teamId: string, lastN = 5) {
  return apiFetch<ApiTeamForm[]>(`/teams/${teamId}/form?lastN=${lastN}`);
}

export function getTeamStats(teamId: string, lastN = 10) {
  return apiFetch<ApiTeamStats>(`/teams/${teamId}/stats?lastN=${lastN}`);
}

export function getH2H(teamAId: string, teamBId: string, lastN = 5) {
  return apiFetch<ApiH2HMatch[]>(`/h2h?teamA=${teamAId}&teamB=${teamBId}&lastN=${lastN}`);
}

export const MARKET_LABEL: Record<string, string> = {
  MONEYLINE_1X2: '1X2',
  OVER_UNDER_GOALS: 'Over/Under',
  ASIAN_HANDICAP: 'Hándicap asiático',
};

export const SELECTION_LABEL: Record<string, string> = {
  over: 'Over',
  under: 'Under',
  home: 'Local',
  away: 'Visitante',
  draw: 'Empate',
};

export function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatSelection(probability: ApiProbability): string {
  const label = SELECTION_LABEL[probability.selection] ?? probability.selection;
  return probability.line != null ? `${label} ${probability.line}` : label;
}

export interface FeaturedMatch {
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  kickoff: string;
  market: string;
  selection: string;
  probability: number;
  confidence: ConfidenceLevel;
}

/**
 * Trae el próximo partido programado y su probabilidad más ilustrativa (over/under
 * 2.5 si existe, si no la primera disponible) para destacarlo en la landing.
 * Devuelve `null` ante cualquier fallo (API caída, sin datos sincronizados aún) en
 * vez de propagar el error — la landing debe degradar con un mensaje, no romperse.
 */
export async function getFeaturedMatch(): Promise<FeaturedMatch | null> {
  try {
    const { items } = await getFixtures({ status: 'SCHEDULED', limit: 1 });
    const fixture = items[0];
    if (!fixture) return null;

    const probabilities = await getFixtureProbabilities(fixture.id);
    const featured =
      probabilities.find((p) => p.market === 'OVER_UNDER_GOALS' && p.selection === 'over' && p.line === 2.5) ??
      probabilities[0];
    if (!featured) return null;

    return {
      homeTeam: fixture.homeTeam.name,
      awayTeam: fixture.awayTeam.name,
      leagueName: fixture.league.name,
      kickoff: formatKickoff(fixture.kickoff),
      market: MARKET_LABEL[featured.market] ?? featured.market,
      selection: formatSelection(featured),
      probability: featured.probability,
      confidence: featured.confidence,
    };
  } catch {
    return null;
  }
}
