import 'reflect-metadata';
import express, { type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
// Se importa el JS compilado por `nest build` (metadata de decoradores emitida por tsc).
import { AppModule } from '../dist/app.module';
import { configureApp } from '../dist/common/configure-app';
import { env } from '../dist/config/env';

/**
 * Entrada serverless opcional (solo API HTTP, sin worker). El despliegue
 * recomendado es el contenedor de Render/Railway/Fly (ver docs/deployment.md):
 * aquí no hay BullMQ ni SSE de larga duración garantizado.
 */
const expressApp = express();
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), { bodyParser: false });
  configureApp(app, env());
  await app.init();
}

export default async function handler(req: Request, res: Response): Promise<void> {
  if (!bootstrapped) bootstrapped = bootstrap();
  await bootstrapped;
  expressApp(req, res);
}
