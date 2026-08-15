import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { resolveCorsOrigins } from './cors';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { ResponseInterceptor } from './interceptors/response.interceptor';

/** Configuración compartida entre el arranque tradicional (main.ts) y el entrypoint serverless (api/index.ts). */
export function configureApp(app: INestApplication): void {
  app.enableCors({ origin: resolveCorsOrigins() });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.setGlobalPrefix('api/v1');
}
