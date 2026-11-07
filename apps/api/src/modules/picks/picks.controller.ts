import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PicksService } from './picks.service';

@ApiTags('picks')
@Controller('picks')
export class PicksController {
  constructor(private readonly picks: PicksService) {}

  @Get('week')
  @ApiOperation({ summary: 'Pronósticos de una semana (lunes a domingo, hora local) con aciertos de los partidos terminados' })
  @ApiQuery({ name: 'offset', required: false, description: '-1 semana pasada, 0 actual, 1 próxima… (−8 a 8)' })
  week(
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
    @Query('leagueId') leagueId?: string,
    @Query('country') country?: string,
  ) {
    return this.picks.week({ offset: Math.max(-8, Math.min(8, offset)), leagueId: leagueId || undefined, country: country?.slice(0, 60) || undefined });
  }
}
