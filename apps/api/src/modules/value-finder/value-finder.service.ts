import { Injectable } from '@nestjs/common';
import { Market } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ValueFinderQuery {
  sportId?: string;
  leagueId?: string;
  market?: string;
  minEdge: number;
  page: number;
  limit: number;
}

@Injectable()
export class ValueFinderService {
  constructor(private readonly prisma: PrismaService) {}

  async findValueBets(query: ValueFinderQuery) {
    const market = query.market && query.market in Market ? (query.market as Market) : undefined;

    const candidates = await this.prisma.calculatedProbability.findMany({
      where: {
        market,
        edge: { not: null },
        fixture: { sportId: query.sportId, leagueId: query.leagueId, status: { in: ['SCHEDULED', 'LIVE'] } },
      },
      include: { fixture: { include: { homeTeam: true, awayTeam: true, league: true } } },
      orderBy: { edge: 'desc' },
    });

    // El filtro por |edge| se aplica en memoria: el volumen (fixtures próximos × mercados)
    // es acotado en el MVP y no justifica una consulta SQL cruda con ABS().
    const filtered = candidates.filter((c) => Math.abs(c.edge ?? 0) >= query.minEdge);
    const start = (query.page - 1) * query.limit;

    return {
      items: filtered.slice(start, start + query.limit),
      meta: { total: filtered.length, page: query.page, limit: query.limit },
    };
  }
}
