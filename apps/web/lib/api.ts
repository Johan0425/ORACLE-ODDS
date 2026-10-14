/**
 * Cliente de la API de ORACLE ODDS. En servidor usa API_URL (red interna) y en
 * el navegador NEXT_PUBLIC_API_URL. Las funciones `fetch*` nunca lanzan: si la
 * API no responde devuelven `{ ok: false }` para que la página muestre un estado
 * honesto ("datos temporalmente no disponibles") en lugar de datos inventados.
 */

export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const SERVER_API_URL = process.env.API_URL ?? PUBLIC_API_URL;

export function apiBase(): string {
  return typeof window === 'undefined' ? SERVER_API_URL : PUBLIC_API_URL;
}

/** Solo en servidor: identifica el SSR ante la API (no se expone al navegador: no es NEXT_PUBLIC). */
function internalHeaders(): Record<string, string> {
  return typeof window === 'undefined' && process.env.INTERNAL_API_TOKEN ? { 'x-internal-token': process.env.INTERNAL_API_TOKEN } : {};
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export async function apiGet<T>(path: string, init: { revalidate?: number; signal?: AbortSignal } = {}): Promise<Result<T>> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      headers: { accept: 'application/json', ...internalHeaders() },
      signal: init.signal ?? AbortSignal.timeout(10_000),
      ...(typeof window === 'undefined' ? { next: { revalidate: init.revalidate ?? 30 } } : { cache: 'no-store' as const }),
    });
    const body = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string | string[] } } | null;
    if (!res.ok || !body || !('data' in body)) {
      const msg = body?.error?.message;
      return { ok: false, status: res.status, error: Array.isArray(msg) ? msg.join(', ') : (msg ?? `Error ${res.status}`) };
    }
    return { ok: true, data: body.data as T };
  } catch {
    return { ok: false, error: 'La API no está disponible en este momento.' };
  }
}

export async function apiPost<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Result<T>> {
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...internalHeaders(), ...headers },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string | string[]; code?: string } } | null;
    if (!res.ok) {
      const msg = json?.error?.message;
      return { ok: false, status: res.status, error: Array.isArray(msg) ? msg.join(', ') : (msg ?? `Error ${res.status}`) };
    }
    return { ok: true, data: (json?.data ?? (null as T)) as T };
  } catch {
    return { ok: false, error: 'No se pudo contactar la API.' };
  }
}

// ───────────── Tipos de respuesta ─────────────

export interface TeamRef {
  id: string;
  name: string;
  shortName?: string | null;
  logoUrl: string | null;
  slug?: string | null;
}

export interface LeagueRef {
  id: string;
  name: string;
  country?: string | null;
  logoUrl?: string | null;
  slug?: string | null;
}

export interface Fixture {
  id: string;
  slug: string | null;
  kickoff: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'SUSPENDED' | 'ABANDONED';
  statusDetail: string | null;
  elapsedMinutes: number | null;
  period: string | null;
  venue: string | null;
  round: string | null;
  homeScore: number | null;
  awayScore: number | null;
  htHomeScore: number | null;
  htAwayScore: number | null;
  lineupsConfirmed: boolean;
  lastScoreUpdateAt: string | null;
  updatedAt: string;
  homeTeam: TeamRef;
  awayTeam: TeamRef;
  league: LeagueRef;
  sport: { key: string; name: string };
  _count?: { oddsQuotes: number; valueBets: number };
}

export interface FixtureList {
  items: Fixture[];
  meta: { total: number; page: number; limit: number; timezone: string };
}

export interface FixtureEvent {
  id: string;
  minute: number;
  extraMinute: number | null;
  type: string;
  detail: string | null;
  playerName: string | null;
  teamId: string | null;
}

export interface InPlay {
  prematch: Record<string, number>;
  live: { HOME: number; DRAW: number; AWAY: number };
  overUnder: Array<{ line: number; OVER: number; UNDER: number }>;
  method: string;
}

export interface LiveFixture extends Fixture {
  events: FixtureEvent[];
  dataAgeSeconds: number;
  isDelayed: boolean;
  inPlay: InPlay | null;
}

export interface FormItem {
  fixtureId: string;
  kickoff: string;
  opponent: string;
  venue: 'H' | 'A';
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
}

export interface FixtureDetail extends Fixture {
  lineups: Array<{ teamId: string; formation: string | null; coach: string | null; startXI: Array<{ name: string; number: number | null; position: string | null }>; substitutes: Array<{ name: string; number: number | null; position: string | null }>; confirmedAt: string | null; team: { id: string; name: string } }>;
  injuries: Array<{ id: string; status: string; reason: string | null; player: { name: string }; team: { id: string; name: string } | null }>;
  events: FixtureEvent[];
  standings: Array<{ rank: number; points: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; form: string | null; groupName: string; team: { id: string; name: string; logoUrl: string | null } }>;
  form: { home: FormItem[]; away: FormItem[] };
  h2h: Array<{ fixtureId: string; kickoff: string; league: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null }>;
  dataAgeSeconds: number;
}

export interface Factor {
  code: string;
  label: string;
  direction: 'positive' | 'negative' | 'neutral';
  favours?: string;
}

export interface PredictedSelection {
  id: string;
  marketKey: string;
  selectionKey: string;
  line: number | null;
  rawProbability: number;
  calibratedProbability: number;
  isCalibrated: boolean;
  confidence: number;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  uncertaintyLower: number;
  uncertaintyUpper: number;
  fairOdds: number;
  explanation: string;
  factors: Factor[];
  confidenceReductions: string[];
}

export interface Predictions {
  available: boolean;
  reason?: string;
  requireCalibration?: boolean;
  run?: { id: string; modelVersion: string; dataCutoff: string; generatedAt: string; dataQuality: number | null; lambdas: { home: number | null; away: number | null } };
  markets: Array<{ marketKey: string; displayName: string; publication: { published: boolean; reason: string; sampleSize: number; ece: number | null }; selections: PredictedSelection[] }>;
}

export interface Bookmaker {
  slug: string;
  name: string;
  logoUrl: string | null;
  licenseLabel?: string | null;
}

export interface QuoteRow {
  bookmaker: Bookmaker;
  selectionKey: string;
  price: number;
  openingPrice: number;
  previousPrice: number | null;
  movementFromOpening: number;
  impliedProbabilityNoVig: number | null;
  isSuspended: boolean;
  updatedAt: string;
  ageSeconds: number;
  freshness: number;
  isStale: boolean;
  directBetUrl: string | null;
  isAffiliate: boolean;
  diffVsAverage: number | null;
}

export interface OddsMarket {
  marketKey: string;
  displayName: string;
  line: number | null;
  lineKey: string;
  selections: Array<{ selectionKey: string; best: QuoteRow | null; average: number | null; quotes: QuoteRow[] }>;
  hiddenStale: number;
  arbitrage: null | {
    impliedSum: number;
    theoreticalMargin: number;
    stakes: Array<{ selection: string; bookmaker: string; price: number; stake: number; theoreticalReturn: number }>;
    warning: string;
    detectedAt: string;
  };
}

export interface OddsComparison {
  fixtureId: string;
  live: boolean;
  bookmakers: Bookmaker[];
  lastUpdate: string | null;
  markets: OddsMarket[];
  disclaimer: string;
}

export interface OddsHistory {
  series: Array<{ bookmaker: { slug: string; name: string }; selectionKey: string; points: Array<{ at: string; price: number; isLive: boolean }> }>;
}

export interface ValueBet {
  id: string;
  fixtureId: string;
  marketKey: string;
  selectionKey: string;
  line: number | null;
  lineKey: string;
  bookmakerSlug: string;
  price: number;
  probability: number;
  marketProbability: number;
  fairOdds: number;
  edge: number;
  expectedValue: number;
  confidence: number;
  qualityScore: number;
  freshnessScore: number;
  recommendedStakeUnits: number;
  detectedAt: string;
  lastConfirmedAt: string;
  expiresAt: string;
  fixture: Fixture;
  oddsSnapshot: { capturedAt: string; sourceTimestamp: string; directBetUrl: string | null };
  predictionRun: { modelVersion: string; dataCutoff: string; generatedAt: string };
  comparison: Array<{ bookmaker: Bookmaker; price: number; openingPrice: number; movementFromOpening: number; isSuspended: boolean; updatedAt: string; directBetUrl: string | null }>;
  explanation: string | null;
  factors: Factor[];
  risks: string[];
  uncertainty: { lower: number; upper: number } | null;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  isCalibrated: boolean;
}

export interface ValueBetList {
  items: ValueBet[];
  meta: { total: number; page: number; limit: number };
}

export interface DataStatus {
  generatedAt: string;
  timezone: string;
  overall: 'NOT_CONFIGURED' | 'NO_DATA_YET' | 'DEGRADED' | 'OK';
  message: string;
  providers: Array<{ provider: string; configured: boolean; roles: string[]; quota: { usedToday: number; dailyLimit: number; reportedRemaining: number | null } | null }>;
  jobs: Array<{ provider: string; job: string; lastSuccessfulSync: string | null; ageSeconds: number | null; stale: boolean; consecutiveFailures: number; lastError: string | null }>;
  counts: { upcomingFixtures: number; liveFixtures: number; authorizedQuotes: number; activeValueBets: number };
  lastOddsUpdate: string | null;
  authorizedBookmakersConfigured: number;
}

export interface SponsorConfig {
  enabled: boolean;
  slug: string;
  name: string;
  logoUrl: string | null;
  placement: string;
  disclosure: string;
  ageRestriction: number;
  responsibleGamingText: string;
  allowedCountries: string[];
  frequencyCap: number;
  showOnShares: boolean;
  licenseLabel: string | null;
  campaign: string | null;
  disabledReason?: string;
}

export interface TrackRecord {
  summary: {
    bets: number;
    wins: number;
    losses: number;
    pushes: number;
    voids: number;
    staked: number;
    profit: number;
    roi: number;
    yieldPerBet: number;
    hitRate: number;
    maxDrawdown: number;
    avgClv: number | null;
    clvSample: number;
    roiCi: { lower: number; upper: number } | null;
    counts: { total: number; pending: number; won: number; lost: number; push: number; void: number; withdrawnBeforeKickoff: number };
    stakeModel: string;
  };
  equity: Array<{ at: string; units: number }>;
  items: Array<{
    id: string;
    detectedAt: string;
    fixture: { id: string; kickoff: string; homeTeam: string; awayTeam: string; league: string; homeScore: number | null; awayScore: number | null; status: string };
    marketKey: string;
    selectionKey: string;
    line: number | null;
    bookmakerSlug: string;
    price: number;
    probability: number;
    marketProbability: number;
    edge: number;
    expectedValue: number;
    qualityScore: number;
    status: string;
    withdrawnAt: string | null;
    result: string | null;
    profitLossUnits: number | null;
    closingPrice: number | null;
    closingLineValue: number | null;
    modelVersion: string;
  }>;
  meta: { total: number; page: number; limit: number };
}

export interface ModelMetrics {
  modelVersion: string;
  thresholds: { minSamples: number; maxEce: number };
  snapshots: Array<{
    marketKey: string;
    leagueId: string;
    leagueName: string | null;
    oddsBucket: string;
    source: string;
    sampleSize: number;
    brier: number | null;
    logLoss: number | null;
    ece: number | null;
    accuracy: number | null;
    bets: number;
    roi: number | null;
    yieldPerBet: number | null;
    hitRate: number | null;
    maxDrawdown: number | null;
    avgClv: number | null;
    roiCiLower: number | null;
    roiCiUpper: number | null;
    calibrationCurve: unknown;
    isPublishable: boolean;
    computedAt: string;
  }>;
}

export interface League extends LeagueRef {
  season: string;
  isTracked: boolean;
  sport: { key: string; name: string };
}

export interface Sport {
  id: string;
  key: string;
  name: string;
  upcomingFixtures: number;
  modelAvailable: boolean;
}

export interface ShareAsset {
  publicCode: string;
  entityType: string;
  entityId: string;
  format: string;
  payload: {
    picks?: Array<{ homeTeam: string; awayTeam: string; league: string; kickoff: string; market: string; selection: string; odds: number | null; bookmaker: string | null; probability: number | null; fairOdds: number | null; edge: number | null; expectedValue: number | null; confidence: string | null }>;
    combination?: { code: string; legs: Array<{ label?: string; odds: number; probability?: number | null }>; combinedOdds: number; adjustedProbability: number | null; expectedValue: number | null; riskLevel: string };
    challenge?: { code: string; title: string; endsAt: string };
    generatedAt: string;
  };
  showSponsor: boolean;
  sponsor: { name: string; label: string } | null;
  shortUrl: string;
  imageUrl: string | null;
  shareText: string;
  createdAt: string;
  expiresAt: string;
}
