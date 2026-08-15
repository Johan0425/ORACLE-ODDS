import { Controller, Get, Query } from '@nestjs/common';
import { LeaguesService } from './leagues.service';

@Controller('leagues')
export class LeaguesController {
  constructor(private readonly leaguesService: LeaguesService) {}

  @Get()
  findAll(@Query('sportId') sportId?: string, @Query('country') country?: string, @Query('season') season?: string) {
    return this.leaguesService.findAll({ sportId, country, season });
  }
}
