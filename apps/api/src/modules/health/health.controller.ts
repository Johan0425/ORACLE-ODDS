import { Controller, Get, Headers, HttpCode, Inject, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { metricsRegistry } from '../../common/metrics';
import { safeEqual } from '../../common/hashing';
import { DataStatusService } from '../data-status/data-status.service';
import { createRedis } from '../../common/redis';

/** Rutas fuera del prefijo /api/v1 (ver main.ts): /health, /ready, /metrics. */
@ApiTags('health')
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('health')
  @HttpCode(200)
  health() {
    return { status: 'ok', service: 'oracle-odds-api', role: this.env.PROCESS_ROLE, time: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const checks: Record<string, 'ok' | 'fail' | 'skipped'> = { database: 'fail', redis: 'skipped' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }
    if (this.env.REDIS_URL || this.env.REDIS_HOST) {
      const redis = createRedis(this.env, 'readiness');
      try {
        await Promise.race([redis!.ping(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
        checks.redis = 'ok';
      } catch {
        checks.redis = 'fail';
      } finally {
        redis?.disconnect();
      }
    }
    const ok = checks.database === 'ok' && checks.redis !== 'fail';
    if (!ok) throw new ServiceUnavailableException({ status: 'not_ready', checks });
    return { status: 'ready', checks };
  }

  @Get('metrics')
  @ApiExcludeEndpoint()
  async metrics(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    if (this.env.METRICS_TOKEN && !safeEqual(auth ?? '', `Bearer ${this.env.METRICS_TOKEN}`)) throw new UnauthorizedException();
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  }
}

@ApiTags('status')
@Controller()
export class DataStatusController {
  constructor(private readonly status: DataStatusService) {}

  @Get('data-status')
  dataStatus() {
    return this.status.status();
  }
}
