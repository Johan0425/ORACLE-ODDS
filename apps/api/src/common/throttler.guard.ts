import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env';
import { safeEqual } from './hashing';

/**
 * Rate limiting por IP para tráfico de navegador. El render en servidor del
 * frontend comparte una sola IP para todos los usuarios: se identifica con
 * INTERNAL_API_TOKEN y no consume el cupo por IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(options: ThrottlerModuleOptions, storage: ThrottlerStorage, reflector: Reflector, @Inject(APP_ENV) private readonly env: AppEnv) {
    super(options, storage, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const token = this.env.INTERNAL_API_TOKEN;
    if (!token) return false;
    const provided = context.switchToHttp().getRequest<Request>().headers['x-internal-token'];
    return typeof provided === 'string' && safeEqual(provided, token);
  }
}
