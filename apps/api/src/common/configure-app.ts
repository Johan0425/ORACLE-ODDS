import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '../config/env';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { runWithContext } from './request-context';
import { httpRequests } from './metrics';
import { appLogger } from './logger';

const REQUEST_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** CORS por allowlist. Sin CORS_ORIGIN (solo fuera de producción) se permite localhost. */
export function corsOrigin(env: Pick<AppEnv, 'CORS_ORIGIN' | 'NODE_ENV'>) {
  const allow = env.CORS_ORIGIN.length > 0 ? env.CORS_ORIGIN : env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  return (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
    // Peticiones sin Origin (server-to-server, curl, SSR de Next.js) no son de navegador.
    if (!origin) return cb(null, true);
    cb(null, allow.includes(origin));
  };
}

/** Configuración compartida por main.ts (contenedor) y api/index.ts (serverless). */
export function configureApp(app: INestApplication, env: AppEnv): void {
  const express = app as NestExpressApplication;
  if (env.TRUST_PROXY) express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = String(req.headers['x-request-id'] ?? '');
    const requestId = REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = (req.route?.path as string | undefined) ?? 'unmatched';
      httpRequests.observe({ method: req.method, route, status: String(res.statusCode) }, seconds);
      if (res.statusCode >= 500) appLogger.event('error', 'HTTP 5xx', { method: req.method, route, status: res.statusCode, requestId });
    });
    runWithContext({ correlationId: requestId }, () => next());
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          // Swagger UI se sirve desde la propia API.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(json({ limit: '100kb', verify: (req: Request & { rawBody?: Buffer }, _res, buf) => (req.rawBody = buf) }));
  app.use(urlencoded({ extended: false, limit: '20kb' }));
  app.enableCors({ origin: corsOrigin(env), methods: ['GET', 'POST'], allowedHeaders: ['content-type', 'x-participant-token', 'x-creator-secret', 'x-request-id'], maxAge: 600 });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });

  const doc = new DocumentBuilder()
    .setTitle('ORACLE ODDS API')
    .setDescription('Comparador de cuotas, estimaciones probabilísticas y retos sociales sin dinero real. ORACLE ODDS no acepta apuestas.')
    .setVersion('1.0.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'api/docs/openapi.json' });
}
