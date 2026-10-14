import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { safeEqual } from '../../common/hashing';

/** Protege endpoints administrativos con SYNC_ADMIN_SECRET (cabecera `x-admin-secret`). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  canActivate(ctx: ExecutionContext): boolean {
    const secret = this.env.SYNC_ADMIN_SECRET;
    if (!secret) throw new ServiceUnavailableException('Administración deshabilitada: SYNC_ADMIN_SECRET no configurado');
    const req = ctx.switchToHttp().getRequest<Request>();
    const provided = String(req.headers['x-admin-secret'] ?? '');
    if (!provided || !safeEqual(provided, secret)) throw new ForbiddenException('Credencial administrativa inválida');
    return true;
  }
}
