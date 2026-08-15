import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException(`Equipo ${id} no encontrado`);
    return team;
  }

  private recentMatches(teamId: string, lastN: number) {
    return this.prisma.fixtureStat.findMany({
      where: { teamId },
      orderBy: { fixture: { kickoff: 'desc' } },
      take: lastN,
      include: { fixture: true },
    });
  }

  async stats(teamId: string, lastN: number) {
    const recent = await this.recentMatches(teamId, lastN);
    if (recent.length === 0) {
      return { sampleSize: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, avgCorners: 0, avgCards: 0 };
    }

    const sum = (pick: (s: (typeof recent)[number]) => number | null) =>
      recent.reduce((acc, s) => acc + (pick(s) ?? 0), 0);

    return {
      sampleSize: recent.length,
      avgGoalsFor: sum((s) => s.goalsFor) / recent.length,
      avgGoalsAgainst: sum((s) => s.goalsAgainst) / recent.length,
      avgCorners: sum((s) => s.corners) / recent.length,
      avgCards: sum((s) => (s.yellowCards ?? 0) + (s.redCards ?? 0)) / recent.length,
    };
  }

  async form(teamId: string, lastN: number) {
    const recent = await this.recentMatches(teamId, lastN);
    return recent.map((s) => {
      const goalsFor = s.goalsFor ?? 0;
      const goalsAgainst = s.goalsAgainst ?? 0;
      const result = goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L';
      return { fixtureId: s.fixtureId, kickoff: s.fixture.kickoff, result, goalsFor, goalsAgainst };
    });
  }

  async headToHead(teamAId: string, teamBId: string, lastN: number) {
    const fixtures = await this.prisma.fixture.findMany({
      where: {
        status: 'FINISHED',
        OR: [
          { homeTeamId: teamAId, awayTeamId: teamBId },
          { homeTeamId: teamBId, awayTeamId: teamAId },
        ],
      },
      orderBy: { kickoff: 'desc' },
      take: lastN,
    });

    return fixtures.map((f) => ({
      fixtureId: f.id,
      kickoff: f.kickoff,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      totalGoals: (f.homeScore ?? 0) + (f.awayScore ?? 0),
    }));
  }
}
