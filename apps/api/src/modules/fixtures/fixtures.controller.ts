import { Controller, Get, MessageEvent, Param, ParseIntPipe, DefaultValuePipe, Query, Sse } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type { FixtureStatus } from '@prisma/client';
import { FixturesService } from './fixtures.service';
import { LiveEventsService } from '../live/live-events.service';

const STATUSES = ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED', 'ABANDONED'];

@ApiTags('fixtures')
@Controller('fixtures')
export class FixturesController {
  constructor(private readonly fixtures: FixturesService, private readonly live: LiveEventsService) {}

  @Get('live')
  @ApiOperation({ summary: 'Partidos en vivo con antigüedad del dato y probabilidad actualizada' })
  findLive(@Query('sport') sport?: string, @Query('leagueId') leagueId?: string) {
    return this.fixtures.findLive(sport, leagueId);
  }

  @Sse('live/stream')
  @ApiOperation({ summary: 'Stream SSE de actualizaciones en vivo (marcador, eventos, cuotas)' })
  stream(@Query('fixtureId') fixtureId?: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.live.subscribe((u) => {
        if (fixtureId && u.fixtureId !== fixtureId) return;
        subscriber.next({ data: u, type: u.type });
      });
      // Latido cada 20 s para mantener abiertas conexiones detrás de proxies.
      const heartbeat = setInterval(() => subscriber.next({ data: { at: new Date().toISOString() }, type: 'heartbeat' }), 20_000);
      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    });
  }

  @Get()
  @ApiOperation({ summary: 'Calendario de partidos reales' })
  @ApiQuery({ name: 'date', required: false, description: 'today | tomorrow | week | YYYY-MM-DD (zona DEFAULT_TIMEZONE)' })
  @ApiQuery({ name: 'status', required: false, enum: STATUSES })
  findAll(
    @Query('sport') sport?: string,
    @Query('leagueId') leagueId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.fixtures.findAll({
      sport,
      leagueId,
      date,
      status: status && STATUSES.includes(status) ? (status as FixtureStatus) : undefined,
      q: q?.slice(0, 60),
      page: Math.max(1, page),
      limit: Math.min(Math.max(1, limit), 100),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle: resumen, forma, H2H, tabla, lesiones, alineaciones, eventos' })
  findOne(@Param('id') id: string) {
    return this.fixtures.findOne(id);
  }

  @Get(':id/statistics')
  statistics(@Param('id') id: string) {
    return this.fixtures.statistics(id);
  }

  @Get(':id/predictions')
  @ApiOperation({ summary: 'Predicción vigente (solo mercados validados fuera de muestra)' })
  predictions(@Param('id') id: string) {
    return this.fixtures.predictions(id);
  }

  @Get(':id/live-probabilities')
  inPlay(@Param('id') id: string) {
    return this.fixtures.inPlay(id);
  }

  @Get(':id/odds')
  @ApiOperation({ summary: 'Comparador de cuotas con apertura, movimiento, frescura y arbitraje' })
  odds(@Param('id') id: string, @Query('live') live?: string, @Query('includeStale') includeStale?: string) {
    return this.fixtures.odds(id, { live: live == null ? undefined : live === 'true', includeStale: includeStale === 'true' });
  }

  @Get(':id/odds-history')
  oddsHistory(@Param('id') id: string, @Query('market') market = '1X2', @Query('line') line = '', @Query('selection') selection?: string) {
    return this.fixtures.oddsHistory(id, market, line, selection);
  }
}
