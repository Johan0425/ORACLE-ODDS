import 'reflect-metadata';
import express, { type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
// Se importa desde `dist/` (compilado por `nest build` en el paso de build de
// Vercel), no desde `src/`: la metadata de los decoradores de Nest la emite
// `tsc`, no el transpiler propio de Vercel — importar el JS ya compilado evita
// depender de que ese transpiler soporte `emitDecoratorMetadata` correctamente.
import { AppModule } from '../dist/app.module';
import { configureApp } from '../dist/common/configure-app';

const expressApp = express();
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
  configureApp(app);
  await app.init();
}

// Reutiliza la misma instancia de Nest entre invocaciones de la función mientras
// la instancia de Fluid Compute siga viva, en vez de rehacer todo el bootstrap
// (resolución de módulos, DI, etc.) en cada request.
export default async function handler(req: Request, res: Response): Promise<void> {
  if (!bootstrapped) bootstrapped = bootstrap();
  await bootstrapped;
  expressApp(req, res);
}
