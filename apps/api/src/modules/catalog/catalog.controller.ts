import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SPORT_MODELS } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sports')
  @ApiOperation({ summary: 'Deportes con número de partidos reales próximos y estado del modelo' })
  async sports() {
    const sports = await this.prisma.sport.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const counts = await this.prisma.fixture.groupBy({ by: ['sportId'], where: { primaryProvider: { not: null }, kickoff: { gte: new Date() } }, _count: { _all: true } });
    return sports.map((s) => ({
      ...s,
      upcomingFixtures: counts.find((c) => c.sportId === s.id)?._count._all ?? 0,
      modelAvailable: SPORT_MODELS[s.key].implemented,
      modelVersion: SPORT_MODELS[s.key].modelVersion,
    }));
  }

  @Get('leagues')
  @ApiOperation({ summary: 'Competiciones con partidos reales sincronizados' })
  async leagues(@Query('sport') sport?: string, @Query('country') country?: string) {
    return this.prisma.league.findMany({
      where: {
        sport: sport ? { key: sport as never } : undefined,
        country: country || undefined,
        fixtures: { some: { primaryProvider: { not: null } } },
      },
      select: { id: true, name: true, slug: true, country: true, logoUrl: true, season: true, isTracked: true, sport: { select: { key: true, name: true } } },
      orderBy: [{ isTracked: 'desc' }, { name: 'asc' }],
    });
  }

  @Get('markets')
  @ApiOperation({ summary: 'Definiciones canónicas de mercados' })
  markets(@Query('sport') sport = 'FOOTBALL') {
    return this.prisma.marketDefinition.findMany({ where: { sport: { key: sport as never } }, orderBy: { canonicalKey: 'asc' } });
  }

  @Get('bookmakers')
  @ApiOperation({ summary: 'Casas autorizadas y activas' })
  bookmakers() {
    return this.prisma.bookmaker.findMany({
      where: { isAuthorized: true, isActive: true },
      select: { slug: true, name: true, logoUrl: true, websiteUrl: true, licenseLabel: true, country: true, priority: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }
}
