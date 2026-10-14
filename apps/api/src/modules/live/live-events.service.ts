import { EventEmitter } from 'node:events';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { createRedis } from '../../common/redis';

export interface LiveUpdate {
  type: 'fixture' | 'odds' | 'event';
  fixtureId: string;
  at: string;
  /** Segundos entre el dato del proveedor y su publicación (latencia estimada). */
  latencySeconds?: number | null;
  payload: Record<string, unknown>;
}

const CHANNEL = 'oracle-odds:live';

/**
 * Bus de actualizaciones en vivo. El worker publica en Redis; cada réplica de la
 * API se suscribe y reenvía por SSE. Sin Redis funciona en memoria (un solo proceso).
 */
@Injectable()
export class LiveEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(LiveEventsService.name);
  private readonly emitter = new EventEmitter();
  private pub: Redis | null = null;
  private sub: Redis | null = null;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    this.emitter.setMaxListeners(1000);
    if (env.NODE_ENV !== 'test') {
      this.pub = createRedis(env, 'live-pub');
      this.sub = createRedis(env, 'live-sub');
      if (this.sub) {
        this.sub.subscribe(CHANNEL).catch((e) => this.logger.warn(`Sin suscripción en vivo: ${(e as Error).message}`));
        this.sub.on('message', (_channel, message) => {
          try {
            this.emitter.emit('update', JSON.parse(message) as LiveUpdate);
          } catch {
            /* mensaje mal formado: se ignora */
          }
        });
      }
    }
  }

  async publish(update: LiveUpdate): Promise<void> {
    if (this.pub) await this.pub.publish(CHANNEL, JSON.stringify(update));
    else this.emitter.emit('update', update);
  }

  subscribe(listener: (u: LiveUpdate) => void): () => void {
    this.emitter.on('update', listener);
    return () => this.emitter.off('update', listener);
  }

  async onModuleDestroy() {
    await Promise.all([this.pub?.quit().catch(() => undefined), this.sub?.quit().catch(() => undefined)]);
  }
}
