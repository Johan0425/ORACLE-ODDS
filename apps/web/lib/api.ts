import type { ConfidenceLevel } from '@/components/match/MatchCard';

const API_BASE_URL = process.env.API_URL ?? 'http://localhost:3001/api/v1';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiFixtureTeam {
  name: string;
}

interface ApiFixture {
  id: string;
  kickoff: string;
  status: string;
  league: { name: string };
  homeTeam: ApiFixtureTeam;
  awayTeam: ApiFixtureTeam;
}

interface ApiFixtureListResponse {
  items: ApiFixture[];
  meta: { total: number; page: number; limit: number };
}

interface ApiProbability {
  market: string;
  selection: string;
  line: number | null;
  probability: number;
  confidence: ConfidenceLevel;
  explanation: string;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${path} respondió ${res.status}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  return body.data;
}

function getFixtures(params: { status?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.limit) query.set('limit', String(params.limit));
  return apiFetch<ApiFixtureListResponse>(`/fixtures?${query.toString()}`);
}

function getFixtureProbabilities(fixtureId: string) {
  return apiFetch<ApiProbability[]>(`/fixtures/${fixtureId}/probabilities`);
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

const MARKET_LABEL: Record<string, string> = {
  MONEYLINE_1X2: '1X2',
  OVER_UNDER_GOALS: 'Over/Under',
  ASIAN_HANDICAP: 'Hándicap asiático',
};

const SELECTION_LABEL: Record<string, string> = {
  over: 'Over',
  under: 'Under',
  home: 'Local',
  away: 'Visitante',
  draw: 'Empate',
};

function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function formatSelection(probability: ApiProbability): string {
  const label = SELECTION_LABEL[probability.selection] ?? probability.selection;
  return probability.line != null ? `${label} ${probability.line}` : label;
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
