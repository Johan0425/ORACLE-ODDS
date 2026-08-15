import { Controller, Get, Query } from '@nestjs/common';
import { TeamsService } from './teams.service';

@Controller('h2h')
export class H2hController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  headToHead(@Query('teamA') teamA: string, @Query('teamB') teamB: string, @Query('lastN') lastN = '5') {
    return this.teamsService.headToHead(teamA, teamB, Number(lastN));
  }
}
