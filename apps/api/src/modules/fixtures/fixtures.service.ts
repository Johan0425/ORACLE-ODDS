import { Injectable, NotFoundException } from '@nestjs/common';
import type { FixtureStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface FindFixturesQuery {
  sportId?: string;
  leagueId?: string;
  date?: string; // YYYY-MM-DD
  status?: FixtureStatus;
  page: number;
  limit: number;
}

@Injectable()
export class FixturesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindFixturesQuery) {
    const where = {
      sportId: query.sportId,
      leagueId: query.leagueId,
      status: query.status,
      ...(query.date && {
        kickoff: {
          gte: new Date(`${query.date}T00:00:00.000Z`),
          lt: new Date(`${query.date}T23:59:59.999Z`),
        },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.fixture.findMany({
        where,
        orderBy: { kickoff: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { homeTeam: true, awayTeam: true, league: true },
      }),
      this.prisma.fixture.count({ where }),
    ]);

    return { items, meta: { total, page: query.page, limit: query.limit } };
  }

  findLive() {
    return this.prisma.fixture.findMany({
      where: { status: 'LIVE' },
      include: { homeTeam: true, awayTeam: true, league: true },
      orderBy: { kickoff: 'asc' },
    });
  }

  async findOne(id: string) {
    const fixture = await this.prisma.fixture.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true, league: true },
    });
    if (!fixture) throw new NotFoundException(`Partido ${id} no encontrado`);
    return fixture;
  }

  async stats(id: string) {
    await this.findOne(id);
    return this.prisma.fixtureStat.findMany({ where: { fixtureId: id } });
  }
}
