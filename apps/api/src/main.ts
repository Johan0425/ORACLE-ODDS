import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { env, EnvValidationError, loadDotEnv } from './config/env';
import { appLogger } from './common/logger';
import { initSentry } from './common/sentry';

async function bootstrap() {
  loadDotEnv();
  // Valida el entorno antes de levantar nada: un error de configuración detiene el proceso con un mensaje claro.
  const config = env();
  await initSentry(config);
  const { AppModule } = await import('./app.module');
  const { configureApp } = await import('./common/configure-app');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: appLogger, bodyParser: false });
  configureApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
  appLogger.log(`API escuchando en :${config.PORT} (${config.NODE_ENV})`, 'Bootstrap');
}

bootstrap().catch((error) => {
  if (error instanceof EnvValidationError) process.stderr.write(`${error.message}\n`);
  else appLogger.error((error as Error).message, (error as Error).stack, 'Bootstrap');
  process.exit(1);
});
