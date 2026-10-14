import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SettlementResult } from '@prisma/client';
import { ValueBetsService } from './value-bets.service';
import { TrackRecordService } from '../track-record/track-record.service';
import { ModelMetricsService } from '../model-metrics/model-metrics.service';

const num = (v?: string) => (v == null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const date = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined);
const RESULTS: SettlementResult[] = ['WIN', 'LOSS', 'PUSH', 'HALF_WIN', 'HALF_LOSS', 'VOID'];

@ApiTags('value')
@Controller()
export class ValueBetsController {
  constructor(private readonly valueBets: ValueBetsService, private readonly trackRecord: TrackRecordService, private readonly metrics: ModelMetricsService) {}

  @Get('value-bets')
  @ApiOperation({ summary: 'Mejores oportunidades activas, ordenadas por qualityScore por defecto' })
  list(
    @Query('sport') sport?: string,
    @Query('leagueId') leagueId?: string,
    @Query('market') market?: string,
    @Query('minEdge') minEdge?: string,
    @Query('minEv') minEv?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('minOdds') minOdds?: string,
    @Query('maxOdds') maxOdds?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.valueBets.list({
      sport,
      leagueId,
      market,
      minEdge: num(minEdge),
      minEv: num(minEv),
      minConfidence: num(minConfidence),
      minOdds: num(minOdds),
      maxOdds: num(maxOdds),
      from: date(from),
      to: date(to),
      sort: (['quality', 'edge', 'ev', 'kickoff'] as const).find((s) => s === sort) ?? 'quality',
      page: Math.max(1, page),
      limit: Math.min(Math.max(1, limit), 100),
    });
  }

  @Get('track-record')
  @ApiOperation({ summary: 'Historial auditable de oportunidades publicadas (incluye pérdidas)' })
  track(
    @Query('market') market?: string,
    @Query('leagueId') leagueId?: string,
    @Query('result') result?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('oddsBucket') oddsBucket?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.trackRecord.get({
      market,
      leagueId,
      result: RESULTS.find((r) => r === result),
      from: date(from),
      to: date(to),
      oddsBucket,
      page: Math.max(1, page),
      limit: Math.min(Math.max(1, limit), 200),
    });
  }

  @Get('model-metrics')
  @ApiOperation({ summary: 'Brier, log loss, ECE, curvas de calibración, ROI, yield, CLV y drawdown' })
  modelMetrics() {
    return this.metrics.publicMetrics();
  }
}
