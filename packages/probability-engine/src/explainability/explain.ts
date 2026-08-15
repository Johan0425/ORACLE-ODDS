export interface ExplainContext {
  homeTeamName: string;
  awayTeamName: string;
  homeAvgGoalsScored: number;
  awayAvgGoalsScored: number;
  homeAvgGoalsConceded: number;
  awayAvgGoalsConceded: number;
}

function pct(probability: number): number {
  return Math.round(probability * 100);
}

export function explainMoneyline(
  ctx: ExplainContext & { selection: 'home' | 'draw' | 'away'; probability: number },
): string {
  const subject =
    ctx.selection === 'home' ? ctx.homeTeamName : ctx.selection === 'away' ? ctx.awayTeamName : 'Empate';

  return (
    `${subject} (${pct(ctx.probability)}%) — ` +
    `${ctx.homeTeamName} promedia ${ctx.homeAvgGoalsScored.toFixed(1)} goles a favor y ${ctx.homeAvgGoalsConceded.toFixed(1)} en contra por partido; ` +
    `${ctx.awayTeamName} promedia ${ctx.awayAvgGoalsScored.toFixed(1)} a favor y ${ctx.awayAvgGoalsConceded.toFixed(1)} en contra`
  );
}

export function explainOverUnder(
  ctx: ExplainContext & {
    selection: 'over' | 'under';
    line: number;
    probability: number;
    h2hOverRate?: { overCount: number; totalMatches: number; line: number };
  },
): string {
  const parts = [
    `${ctx.selection === 'over' ? 'Over' : 'Under'} ${ctx.line} goles: ${pct(ctx.probability)}%`,
    `${ctx.homeTeamName} y ${ctx.awayTeamName} promedian ${ctx.homeAvgGoalsScored.toFixed(1)} y ${ctx.awayAvgGoalsScored.toFixed(1)} goles anotados en sus últimos partidos`,
  ];

  if (ctx.h2hOverRate) {
    parts.push(
      `el historial H2H registra over ${ctx.h2hOverRate.line} en ${ctx.h2hOverRate.overCount} de los últimos ${ctx.h2hOverRate.totalMatches} enfrentamientos`,
    );
  }

  return parts.join(' — ');
}

export function explainHandicap(
  ctx: ExplainContext & { selection: 'home' | 'away'; line: number; probability: number },
): string {
  const subject = ctx.selection === 'home' ? ctx.homeTeamName : ctx.awayTeamName;
  const displayLine = ctx.selection === 'home' ? ctx.line : -ctx.line;

  return (
    `${subject} (${displayLine > 0 ? '+' : ''}${displayLine}): ${pct(ctx.probability)}% de cubrir el hándicap — ` +
    `basado en la diferencia de goles esperada según el rendimiento reciente de ambos equipos`
  );
}
