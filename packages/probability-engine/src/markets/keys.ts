/**
 * Claves canónicas de mercado y selección compartidas por el motor, la API y el
 * frontend. Los adaptadores de proveedores traducen sus propios nombres
 * ("h2h", "totals", "Match Winner", ...) a estas claves; nada aguas abajo
 * depende del vocabulario de un proveedor concreto.
 */
export const MARKET_KEYS = [
  '1X2',
  'ML',
  'DC',
  'DNB',
  'OU_GOALS',
  'BTTS',
  'AH',
  'EH',
  'OU_CORNERS',
  'OU_CARDS',
  'CS',
  '1X2_H1',
  'OU_GOALS_H1',
  'SPREAD',
  'OU_POINTS',
] as const;

export type MarketKey = (typeof MARKET_KEYS)[number];

export type SelectionKey =
  | 'HOME'
  | 'DRAW'
  | 'AWAY'
  | 'HOME_DRAW'
  | 'HOME_AWAY'
  | 'DRAW_AWAY'
  | 'OVER'
  | 'UNDER'
  | 'YES'
  | 'NO'
  | `${number}-${number}`;

export type OutcomeType = 'THREE_WAY' | 'TWO_WAY' | 'MULTI';

export interface MarketDefinitionSpec {
  key: MarketKey;
  displayName: string;
  period: 'FT' | 'H1';
  outcomeType: OutcomeType;
  supportsLine: boolean;
  /** Selecciones que forman un libro completo (necesario para quitar el vig). */
  selections: readonly SelectionKey[] | 'SCORES';
  sports: readonly string[];
}

export const SETTLEMENT_RULES_VERSION = '2026.10.1';

export const MARKET_DEFINITIONS: Record<MarketKey, MarketDefinitionSpec> = {
  '1X2': { key: '1X2', displayName: 'Resultado final (1X2)', period: 'FT', outcomeType: 'THREE_WAY', supportsLine: false, selections: ['HOME', 'DRAW', 'AWAY'], sports: ['FOOTBALL', 'HOCKEY'] },
  ML: { key: 'ML', displayName: 'Ganador (moneyline)', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: false, selections: ['HOME', 'AWAY'], sports: ['BASKETBALL', 'TENNIS', 'BASEBALL', 'NFL', 'HOCKEY', 'MMA'] },
  DC: { key: 'DC', displayName: 'Doble oportunidad', period: 'FT', outcomeType: 'MULTI', supportsLine: false, selections: ['HOME_DRAW', 'HOME_AWAY', 'DRAW_AWAY'], sports: ['FOOTBALL'] },
  DNB: { key: 'DNB', displayName: 'Empate no válido', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: false, selections: ['HOME', 'AWAY'], sports: ['FOOTBALL'] },
  OU_GOALS: { key: 'OU_GOALS', displayName: 'Más/Menos goles', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['OVER', 'UNDER'], sports: ['FOOTBALL'] },
  BTTS: { key: 'BTTS', displayName: 'Ambos equipos marcan', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: false, selections: ['YES', 'NO'], sports: ['FOOTBALL'] },
  AH: { key: 'AH', displayName: 'Hándicap asiático', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['HOME', 'AWAY'], sports: ['FOOTBALL'] },
  EH: { key: 'EH', displayName: 'Hándicap europeo', period: 'FT', outcomeType: 'THREE_WAY', supportsLine: true, selections: ['HOME', 'DRAW', 'AWAY'], sports: ['FOOTBALL'] },
  OU_CORNERS: { key: 'OU_CORNERS', displayName: 'Más/Menos córners', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['OVER', 'UNDER'], sports: ['FOOTBALL'] },
  OU_CARDS: { key: 'OU_CARDS', displayName: 'Más/Menos tarjetas', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['OVER', 'UNDER'], sports: ['FOOTBALL'] },
  CS: { key: 'CS', displayName: 'Marcador correcto', period: 'FT', outcomeType: 'MULTI', supportsLine: false, selections: 'SCORES', sports: ['FOOTBALL'] },
  '1X2_H1': { key: '1X2_H1', displayName: '1X2 primera mitad', period: 'H1', outcomeType: 'THREE_WAY', supportsLine: false, selections: ['HOME', 'DRAW', 'AWAY'], sports: ['FOOTBALL'] },
  OU_GOALS_H1: { key: 'OU_GOALS_H1', displayName: 'Más/Menos goles primera mitad', period: 'H1', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['OVER', 'UNDER'], sports: ['FOOTBALL'] },
  SPREAD: { key: 'SPREAD', displayName: 'Hándicap de puntos (spread)', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['HOME', 'AWAY'], sports: ['BASKETBALL', 'NFL', 'BASEBALL', 'HOCKEY'] },
  OU_POINTS: { key: 'OU_POINTS', displayName: 'Más/Menos puntos', period: 'FT', outcomeType: 'TWO_WAY', supportsLine: true, selections: ['OVER', 'UNDER'], sports: ['BASKETBALL', 'NFL', 'BASEBALL', 'HOCKEY'] },
};

export function isMarketKey(value: string): value is MarketKey {
  return (MARKET_KEYS as readonly string[]).includes(value);
}

/**
 * Representación estable de una línea para claves únicas e índices: `""` cuando
 * el mercado no tiene línea. Se normaliza a cuartos para que 2.5 y 2.50 sean la
 * misma línea sin depender de la precisión de punto flotante.
 */
export function lineKey(line: number | null | undefined): string {
  if (line == null || Number.isNaN(line)) return '';
  const rounded = Math.round(line * 4) / 4;
  return rounded === 0 ? '0' : String(rounded);
}

export const SELECTION_LABELS_ES: Record<string, string> = {
  HOME: 'Local',
  DRAW: 'Empate',
  AWAY: 'Visitante',
  HOME_DRAW: 'Local o empate',
  HOME_AWAY: 'Local o visitante',
  DRAW_AWAY: 'Empate o visitante',
  OVER: 'Más de',
  UNDER: 'Menos de',
  YES: 'Sí',
  NO: 'No',
};
