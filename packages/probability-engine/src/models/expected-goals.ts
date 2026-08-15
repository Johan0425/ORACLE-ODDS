import { weightedAverage } from './weighted-form';
import { applyHomeAdvantage, DEFAULT_HOME_ADVANTAGE } from './home-advantage';
import type { ExpectedGoals, LeagueGoalContext, TeamRecentData } from '../types';

function buildGoalProfile(team: TeamRecentData) {
  return {
    scoredWeightedAvg: weightedAverage(team.recentMatches.map((m) => m.goalsFor)),
    concededWeightedAvg: weightedAverage(team.recentMatches.map((m) => m.goalsAgainst)),
  };
}

/**
 * Modelo de fuerza de ataque/defensa relativo al promedio de liga (Dixon-Coles
 * simplificado). Simplificación deliberada para el MVP: no se separan las muestras
 * en "solo como local" / "solo como visitante" porque con 10-15 partidos recientes
 * por equipo la submuestra sería demasiado pequeña para ser fiable; la ventaja de
 * local se aplica aparte como factor multiplicativo sobre el resultado.
 */
export function estimateExpectedGoals(
  home: TeamRecentData,
  away: TeamRecentData,
  league: LeagueGoalContext,
  homeAdvantageFactor: number = DEFAULT_HOME_ADVANTAGE,
): ExpectedGoals {
  const homeProfile = buildGoalProfile(home);
  const awayProfile = buildGoalProfile(away);

  const homeAttackStrength = homeProfile.scoredWeightedAvg / league.avgHomeGoalsScored;
  const homeDefenseStrength = homeProfile.concededWeightedAvg / league.avgAwayGoalsScored;
  const awayAttackStrength = awayProfile.scoredWeightedAvg / league.avgAwayGoalsScored;
  const awayDefenseStrength = awayProfile.concededWeightedAvg / league.avgHomeGoalsScored;

  const homeExpectedGoals = league.avgHomeGoalsScored * homeAttackStrength * awayDefenseStrength;
  const awayExpectedGoals = league.avgAwayGoalsScored * awayAttackStrength * homeDefenseStrength;

  return {
    home: applyHomeAdvantage(homeExpectedGoals, homeAdvantageFactor),
    away: awayExpectedGoals,
  };
}
