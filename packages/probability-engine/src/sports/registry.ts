import { FOOTBALL_MODEL_VERSION, predictFootballFixture, type FootballPredictionInput, type FootballPrediction } from '../ensemble/football';
import type { MarketKey } from '../markets/keys';

export type SportKey = 'FOOTBALL' | 'BASKETBALL' | 'TENNIS' | 'BASEBALL' | 'NFL' | 'HOCKEY' | 'MMA';

/**
 * Contrato que debe cumplir el modelo de cada deporte. Fútbol es el único
 * implementado; el resto declara `implemented: false` y la API no publica
 * predicciones para ellos (solo comparación de cuotas).
 */
export interface SportModel<I = unknown, O = unknown> {
  sport: SportKey;
  implemented: boolean;
  modelVersion: string | null;
  supportedMarkets: MarketKey[];
  predict(input: I): O;
}

class NotImplementedSportModel implements SportModel<never, never> {
  readonly implemented = false;
  readonly modelVersion = null;
  readonly supportedMarkets: MarketKey[] = [];
  constructor(readonly sport: SportKey) {}
  predict(): never {
    throw new Error(`Modelo para ${this.sport} no implementado: solo se ofrece comparación de cuotas`);
  }
}

export const footballModel: SportModel<FootballPredictionInput, FootballPrediction> = {
  sport: 'FOOTBALL',
  implemented: true,
  modelVersion: FOOTBALL_MODEL_VERSION,
  supportedMarkets: ['1X2', 'DC', 'DNB', 'OU_GOALS', 'BTTS', 'AH', 'EH', 'CS', '1X2_H1', 'OU_GOALS_H1', 'OU_CORNERS', 'OU_CARDS'],
  predict: (input) => predictFootballFixture(input),
};

export const SPORT_MODELS: Record<SportKey, SportModel<any, any>> = {
  FOOTBALL: footballModel,
  BASKETBALL: new NotImplementedSportModel('BASKETBALL'),
  TENNIS: new NotImplementedSportModel('TENNIS'),
  BASEBALL: new NotImplementedSportModel('BASEBALL'),
  NFL: new NotImplementedSportModel('NFL'),
  HOCKEY: new NotImplementedSportModel('HOCKEY'),
  MMA: new NotImplementedSportModel('MMA'),
};
