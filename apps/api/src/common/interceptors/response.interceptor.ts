import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Envuelve toda respuesta JSON exitosa en `{ data }`. Los streams SSE pasan sin envoltura. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, { data: T } | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<{ data: T } | T> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req?.path?.endsWith('/stream')) return next.handle();
    return next.handle().pipe(map((data) => ({ data })));
  }
}
