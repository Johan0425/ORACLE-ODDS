import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  favoriteTeams(userId: string) {
    return this.prisma.favoriteTeam.findMany({ where: { userId }, include: { team: true } });
  }

  addFavoriteTeam(userId: string, teamId: string) {
    return this.prisma.favoriteTeam.upsert({
      where: { userId_teamId: { userId, teamId } },
      create: { userId, teamId },
      update: {},
    });
  }

  removeFavoriteTeam(userId: string, teamId: string) {
    return this.prisma.favoriteTeam.delete({ where: { userId_teamId: { userId, teamId } } }).catch(() => undefined);
  }

  favoriteLeagues(userId: string) {
    return this.prisma.favoriteLeague.findMany({ where: { userId }, include: { league: true } });
  }

  addFavoriteLeague(userId: string, leagueId: string) {
    return this.prisma.favoriteLeague.upsert({
      where: { userId_leagueId: { userId, leagueId } },
      create: { userId, leagueId },
      update: {},
    });
  }

  removeFavoriteLeague(userId: string, leagueId: string) {
    return this.prisma.favoriteLeague
      .delete({ where: { userId_leagueId: { userId, leagueId } } })
      .catch(() => undefined);
  }

  history(userId: string, page: number, limit: number) {
    return this.prisma.matchViewHistory.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { fixture: { include: { homeTeam: true, awayTeam: true } } },
    });
  }

  recordView(userId: string, fixtureId: string) {
    return this.prisma.matchViewHistory.create({ data: { userId, fixtureId } });
  }
}
