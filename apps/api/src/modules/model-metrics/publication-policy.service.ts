import { Inject, Injectable } from '@nestjs/common';
import type { SportKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';

export interface MarketPublication {
  published: boolean;
  reason: string;
  sampleSize: number;
  ece: number | null;
}

/**
 * Decide qué mercados se pueden publicar: solo los que tienen muestra
 * suficiente y buena calibración fuera de muestra. Con
 * PUBLISH_REQUIRE_CALIBRATION=false (solo desarrollo) se muestran todos,
 * marcados como "en validación".
 */
@Injectable()
export class PublicationPolicyService {
  private cache: { at: number; key: string; value: Map<string, MarketPublication> } | null = null;

  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Se llama tras recalibrar para que la publicación use el estado nuevo de inmediato. */
  invalidate(): void {
    this.cache = null;
  }

  get requireCalibration(): boolean {
    return this.env.PUBLISH_REQUIRE_CALIBRATION;
  }

  async marketStatus(modelVersion: string, sportKey: SportKey): Promise<Map<string, MarketPublication>> {
    const key = `${modelVersion}:${sportKey}`;
    if (this.cache && this.cache.key === key && Date.now() - this.cache.at < 60_000) return this.cache.value;
    const rows = await this.prisma.modelMetricSnapshot.findMany({
      where: { modelVersion, sportKey, leagueId: '', oddsBucket: '', marketKey: { not: '' }, source: 'backtest' },
    });
    const value = new Map<string, MarketPublication>();
    for (const r of rows) {
      value.set(r.marketKey, {
        published: r.isPublishable,
        reason: r.isPublishable
          ? `Validado fuera de muestra (n=${r.sampleSize}, ECE ${(r.ece ?? 0).toFixed(3)})`
          : r.sampleSize < this.env.CALIBRATION_MIN_SAMPLES
            ? `Muestra insuficiente (${r.sampleSize} < ${this.env.CALIBRATION_MIN_SAMPLES})`
            : `Calibración insuficiente (ECE ${(r.ece ?? 0).toFixed(3)} > ${this.env.CALIBRATION_MAX_ECE})`,
        sampleSize: r.sampleSize,
        ece: r.ece,
      });
    }
    this.cache = { at: Date.now(), key, value };
    return value;
  }

  async isPublished(modelVersion: string, sportKey: SportKey, marketKey: string): Promise<MarketPublication> {
    const status = (await this.marketStatus(modelVersion, sportKey)).get(marketKey);
    if (status?.published) return status;
    if (!this.requireCalibration) {
      return { published: true, reason: 'Mercado en validación (publicación sin calibración habilitada en este entorno)', sampleSize: status?.sampleSize ?? 0, ece: status?.ece ?? null };
    }
    return status ?? { published: false, reason: 'Sin evaluación fuera de muestra todavía', sampleSize: 0, ece: null };
  }
}
