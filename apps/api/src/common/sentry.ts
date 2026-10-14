import type { AppEnv } from '../config/env';
import { appLogger } from './logger';

/**
 * Sentry opcional: solo se carga si SENTRY_DSN está definido y el paquete
 * `@sentry/node` está instalado. No es una dependencia obligatoria.
 */
export async function initSentry(env: Pick<AppEnv, 'SENTRY_DSN' | 'NODE_ENV'>): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    const moduleName = '@sentry/node';
    const Sentry = (await import(moduleName)) as { init: (o: Record<string, unknown>) => void };
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.05, sendDefaultPii: false });
    appLogger.log('Sentry inicializado', 'Bootstrap');
  } catch {
    appLogger.warn('SENTRY_DSN definido pero @sentry/node no está instalado; se omite', 'Bootstrap');
  }
}
