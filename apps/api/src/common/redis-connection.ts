import type { ConnectionOptions } from 'bullmq';

/**
 * Producción (Render + Upstash) provee una única `REDIS_URL` (`rediss://...`) con
 * password y TLS incluidos. Local/Colima usa host/puerto sueltos, sin TLS. Se
 * parsea a mano en vez de pasarle el string directo a BullMQ para no depender de
 * si esa versión de `@nestjs/bullmq` soporta URLs — así funciona en ambos casos.
 */
export function resolveRedisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    return { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) };
  }

  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
