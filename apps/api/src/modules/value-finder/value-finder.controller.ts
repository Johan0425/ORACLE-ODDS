import { Controller, Get, Query } from '@nestjs/common';
import { ValueFinderService } from './value-finder.service';

@Controller('value-finder')
export class ValueFinderController {
  constructor(private readonly valueFinderService: ValueFinderService) {}

  @Get()
  find(
    @Query('sportId') sportId?: string,
    @Query('leagueId') leagueId?: string,
    @Query('market') market?: string,
    @Query('minEdge') minEdge = '0.05',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.valueFinderService.findValueBets({
      sportId,
      leagueId,
      market,
      minEdge: Number(minEdge),
      page: Number(page),
      limit: Number(limit),
    });
  }
}
