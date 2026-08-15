import { Controller, Get, Param, Query } from '@nestjs/common';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Get(':id/stats')
  stats(@Param('id') id: string, @Query('lastN') lastN = '10') {
    return this.teamsService.stats(id, Number(lastN));
  }

  @Get(':id/form')
  form(@Param('id') id: string, @Query('lastN') lastN = '5') {
    return this.teamsService.form(id, Number(lastN));
  }
}
