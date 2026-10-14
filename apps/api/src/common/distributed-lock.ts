import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

export interface LockHandle {
  key: string;
  release(): Promise<void>;
}

/**
 * Lock distribuido simple (SET NX PX + liberación con token). Evita que dos
 * réplicas del worker ejecuten el mismo job de sincronización a la vez.
 * Sin Redis (tests, ejecución puntual por CLI) se usa un lock en memoria.
 */
export class DistributedLock {
  private readonly local = new Set<string>();

  constructor(private readonly redis: Redis | null) {}

  async acquire(name: string, ttlMs: number): Promise<LockHandle | null> {
    const key = `oracle-odds:lock:${name}`;
    if (!this.redis) {
      if (this.local.has(key)) return null;
      this.local.add(key);
      return { key, release: async () => void this.local.delete(key) };
    }
    const token = randomUUID();
    const ok = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return {
      key,
      release: async () => {
        await this.redis!.eval(RELEASE_SCRIPT, 1, key, token);
      },
    };
  }

  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<{ acquired: boolean; result?: T }> {
    const handle = await this.acquire(name, ttlMs);
    if (!handle) return { acquired: false };
    try {
      return { acquired: true, result: await fn() };
    } finally {
      await handle.release();
    }
  }
}
