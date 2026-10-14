import IORedis, { type Redis, type RedisOptions } from 'ioredis';
import type { AppEnv } from '../config/env';

/** Opciones de conexión a partir de REDIS_URL (Upstash, TLS) o host/puerto locales. */
export function redisOptions(e: Pick<AppEnv, 'REDIS_URL' | 'REDIS_HOST' | 'REDIS_PORT'>): RedisOptions | null {
  if (e.REDIS_URL) {
    const parsed = new URL(e.REDIS_URL);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };
  }
  if (e.REDIS_HOST) return { host: e.REDIS_HOST, port: e.REDIS_PORT, maxRetriesPerRequest: null };
  return null;
}

export function createRedis(e: Pick<AppEnv, 'REDIS_URL' | 'REDIS_HOST' | 'REDIS_PORT'>, name: string): Redis | null {
  const opts = redisOptions(e);
  if (!opts) return null;
  return new IORedis({ ...opts, connectionName: `oracle-odds:${name}`, lazyConnect: false });
}
