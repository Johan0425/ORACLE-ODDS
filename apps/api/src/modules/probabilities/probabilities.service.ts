import { Injectable, NotFoundException } from '@nestjs/common';
import { computeFixtureProbabilities } from '@oracle-odds/probability-engine';
import type { H2HMatchSample, TeamRecentData } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';

const LEAGUE_AVG_HOME_GOALS_FALLBACK = 1.5;
const LEAGUE_AVG_AWAY_GOALS_FALLBACK = 1.1;
const RECENT_MATCHES_SAMPLE = 15;
const H2H_SAMPLE = 10;
const LEAGUE_CONTEXT_SAMPLE = 200;

@Injectable()
export class ProbabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async forFixture(fixtureId: string, market?: string) {
    const fixture = await this.prisma.fixture.findUnique({
      where: { id: fixtureId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!fixture) throw new NotFoundException(`Partido ${fixtureId} no encontrado`);

    const [home, away, h2h, league] = await Promise.all([
      this.buildTeamRecentData(fixture.homeTeamId, fixture.homeTeam.name),
      this.buildTeamRecentData(fixture.awayTeamId, fixture.awayTeam.name),
      this.buildH2H(fixture.homeTeamId, fixture.awayTeamId),
      this.leagueGoalContext(fixture.leagueId),
    ]);

    const results = computeFixtureProbabilities({ home, away, h2h, league });

    return market ? results.filter((r) => r.market === market) : results;
  }

  private async buildTeamRecentData(teamId: string, teamName: string): Promise<TeamRecentData> {
    const stats = await this.prisma.fixtureStat.findMany({
      where: { teamId },
      orderBy: { fixture: { kickoff: 'desc' } },
      take: RECENT_MATCHES_SAMPLE,
    });

    return {
      teamId,
      teamName,
      recentMatches: stats.map((s) => ({
        goalsFor: s.goalsFor ?? 0,
        goalsAgainst: s.goalsAgainst ?? 0,
        corners: s.corners ?? undefined,
        cards: s.yellowCards != null || s.redCards != null ? (s.yellowCards ?? 0) + (s.redCards ?? 0) : undefined,
      })),
    };
  }

  private async buildH2H(teamAId: string, teamBId: string): Promise<H2HMatchSample[]> {
    const fixtures = await this.prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        OR: [
          { homeTeamId: teamAId, awayTeamId: teamBId },
          { homeTeamId: teamBId, awayTeamId: teamAId },
        ],
      },
      orderBy: { kickoff: 'desc' },
      take: H2H_SAMPLE,
    });

    return fixtures.map((f) => ({ totalGoals: (f.homeScore ?? 0) + (f.awayScore ?? 0) }));
  }

  // Fallback a promedios de liga genéricos en cold-start (liga sin partidos finalizados
  // todavía); en cuanto hay histórico real, el promedio se calcula sobre esos datos.
  private async leagueGoalContext(leagueId: string) {
    const finished = await this.prisma.fixture.findMany({
      where: { leagueId, status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
      select: { homeScore: true, awayScore: true },
      orderBy: { kickoff: 'desc' },
      take: LEAGUE_CONTEXT_SAMPLE,
    });

    if (finished.length === 0) {
      return { avgHomeGoalsScored: LEAGUE_AVG_HOME_GOALS_FALLBACK, avgAwayGoalsScored: LEAGUE_AVG_AWAY_GOALS_FALLBACK };
    }

    return {
      avgHomeGoalsScored: finished.reduce((sum, f) => sum + (f.homeScore ?? 0), 0) / finished.length,
      avgAwayGoalsScored: finished.reduce((sum, f) => sum + (f.awayScore ?? 0), 0) / finished.length,
    };
  }
}
