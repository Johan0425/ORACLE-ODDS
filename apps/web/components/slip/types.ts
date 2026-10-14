import type { ComboAnalysis, SystemAnalysis } from '@oracle-odds/probability-engine';

export interface AnalyzeResponse {
  legs: Array<{ id: string; fixtureId: string; marketKey: string; selectionKey: string; line: number | null; odds: number; probability: number | null; label: string; bookmaker: string | null; oddsRefreshed: boolean; kickoff: string; oddsCapturedAt: string | null }>;
  analysis: ComboAnalysis;
  stakeUnits: number;
  potentialReturn: number;
  singles: Array<{ legId: string; label: string; odds: number; probability: number | null; potentialReturn: number; expectedValue: number | null }>;
  systems: Array<SystemAnalysis & { assumesIndependence: boolean; valid: boolean }>;
  publicCode: string | null;
  disclaimer: string;
}
