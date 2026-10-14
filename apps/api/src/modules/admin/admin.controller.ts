import { BadRequestException, Body, Controller, Get, Headers, Inject, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256 } from '../../common/hashing';
import { AdminGuard } from './admin.guard';
import { JOB_NAMES, SyncJobsService, type JobName } from '../sync/sync-jobs.service';
import { QueueService } from '../sync/queue.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';

export class SyncDto {
  @IsIn(JOB_NAMES as unknown as string[]) job!: JobName;
  /** true = ejecutar en este proceso y esperar el resultado (útil sin Redis o para diagnóstico). */
  @IsOptional() @IsBoolean() inline?: boolean;
}

@ApiTags('admin')
@ApiHeader({ name: 'x-admin-secret', required: true })
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly jobs: SyncJobsService, private readonly queues: QueueService, private readonly affiliate: AffiliateService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  private async audit(action: string, secret: string, details: Record<string, unknown>) {
    await this.prisma.adminAuditLog.create({ data: { action, actorHash: sha256(secret).slice(0, 12), details: details as never } });
  }

  @Post('sync')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Encola (o ejecuta en línea) un job de sincronización/cómputo' })
  async sync(@Body() dto: SyncDto, @Headers('x-admin-secret') secret: string) {
    await this.audit('sync', secret, { job: dto.job, inline: !!dto.inline });
    if (dto.inline || this.env.QUEUE_MODE === 'inline') return { mode: 'inline', result: await this.jobs.execute(dto.job) };
    if (!this.queues.available) throw new ServiceUnavailableException('Redis no configurado: usa inline=true o el CLI `npm run job`');
    return { mode: 'queued', jobId: await this.queues.enqueue(dto.job) };
  }

  @Get('queues')
  async queueCounts() {
    const counts = await this.queues.counts();
    if (!counts) throw new BadRequestException('Redis no configurado');
    return counts;
  }

  @Get('sync-runs')
  syncRuns() {
    return this.prisma.syncRunLog.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
  }

  @Get('affiliate/stats')
  affiliateStats() {
    return this.affiliate.stats();
  }
}
