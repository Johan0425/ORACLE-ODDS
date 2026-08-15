import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface FindLeaguesQuery {
  sportId?: string;
  country?: string;
  season?: string;
}

@Injectable()
export class LeaguesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: FindLeaguesQuery) {
    return this.prisma.league.findMany({
      where: { sportId: query.sportId, country: query.country, season: query.season },
      orderBy: { name: 'asc' },
    });
  }
}
