import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { env, EnvValidationError, loadDotEnv } from './config/env';
import { appLogger } from './common/logger';
import { initSentry } from './common/sentry';

/**
 * Proceso worker persistente (Render/Railway/Fly/contenedor). Nunca se ejecuta
 * dentro de funciones serverless. Expone /health en WORKER_HEALTH_PORT para
 * que la plataforma detecte si el worker se detuvo.
 */
async function bootstrap() {
  loadDotEnv();
  const config = env();
  await initSentry(config);
  const { WorkerModule } = await import('./worker.module');
  const { WorkerService } = await import('./modules/sync/queue.service');
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: appLogger });
  app.enableShutdownHooks();
  await app.get(WorkerService).start();

  const port = Number(process.env.WORKER_HEALTH_PORT ?? 0);
  if (port > 0) {
    const http = await import('node:http');
    const { metricsRegistry } = await import('./common/metrics');
    const { safeEqual } = await import('./common/hashing');
    http
      .createServer(async (req, res) => {
        if (req.url === '/metrics') {
          // Mismo control que la API: si hay METRICS_TOKEN se exige Bearer.
          if (config.METRICS_TOKEN && !safeEqual(String(req.headers.authorization ?? ''), `Bearer ${config.METRICS_TOKEN}`)) {
            res.writeHead(401).end();
            return;
          }
          res.writeHead(200, { 'content-type': metricsRegistry.contentType });
          res.end(await metricsRegistry.metrics());
          return;
        }
        res.writeHead(req.url === '/health' ? 200 : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', role: 'worker' }));
      })
      .listen(port);
  }
  appLogger.log('Worker en ejecución', 'Bootstrap');
}

bootstrap().catch((error) => {
  if (error instanceof EnvValidationError) process.stderr.write(`${error.message}\n`);
  else appLogger.error((error as Error).message, (error as Error).stack, 'Bootstrap');
  process.exit(1);
});
