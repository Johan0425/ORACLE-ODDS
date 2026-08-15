import { Controller, Get, Param, Query } from '@nestjs/common';
import type { FixtureStatus } from '@prisma/client';
import { FixturesService } from './fixtures.service';

@Controller('fixtures')
export class FixturesController {
  constructor(private readonly fixturesService: FixturesService) {}

  // Debe declararse antes de ':id' — si no, Nest intentaría resolver "live" como un ID de partido.
  @Get('live')
  findLive() {
    return this.fixturesService.findLive();
  }

  @Get()
  findAll(
    @Query('sportId') sportId?: string,
    @Query('leagueId') leagueId?: string,
    @Query('date') date?: string,
    @Query('status') status?: FixtureStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.fixturesService.findAll({ sportId, leagueId, date, status, page: Number(page), limit: Number(limit) });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.fixturesService.findOne(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string) {
    return this.fixturesService.stats(id);
  }
}
