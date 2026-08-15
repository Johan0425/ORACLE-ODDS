export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ConfidenceInput {
  homeSampleSize: number;
  awaySampleSize: number;
  h2hSampleSize: number;
}

const MIN_SAMPLE_HIGH = 10;
const MIN_SAMPLE_MEDIUM = 5;
const MIN_H2H_FOR_HIGH = 2;

/**
 * La confianza la limita el equipo con MENOS partidos recientes disponibles (el
 * más débil de los dos), reforzada por si además hay suficiente historial H2H directo.
 */
export function assessConfidence(input: ConfidenceInput): ConfidenceLevel {
  const minTeamSample = Math.min(input.homeSampleSize, input.awaySampleSize);

  if (minTeamSample >= MIN_SAMPLE_HIGH && input.h2hSampleSize >= MIN_H2H_FOR_HIGH) return 'high';
  if (minTeamSample >= MIN_SAMPLE_MEDIUM) return 'medium';
  return 'low';
}
