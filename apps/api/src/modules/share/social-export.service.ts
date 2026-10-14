import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { ProviderHttpClient } from '../../common/http/provider-http-client';
import { ShareService } from './share.service';

const DAILY_PICKS = 3;

/**
 * export:social-card — genera piezas compartibles de las mejores oportunidades
 * activas y, si está habilitado y configurado, las publica en un canal de
 * Telegram. No publica nada si no hay oportunidades reales.
 */
@Injectable()
export class SocialExportService {
  private readonly logger = new Logger(SocialExportService.name);

  constructor(private readonly prisma: PrismaService, private readonly share: ShareService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  get telegramEnabled(): boolean {
    return this.env.ENABLE_TELEGRAM_PUBLISH && !!this.env.TELEGRAM_BOT_TOKEN && !!this.env.TELEGRAM_CHANNEL_ID;
  }

  async exportDaily(): Promise<{ created: number; published: number }> {
    const top = await this.prisma.valueBet.findMany({ where: { status: 'ACTIVE' }, orderBy: { qualityScore: 'desc' }, take: DAILY_PICKS, select: { id: true } });
    let created = 0;
    let published = 0;
    for (const vb of top) {
      const asset = await this.share.create({ entityType: 'value_bet', entityId: vb.id, format: 'telegram', showSponsor: true });
      created += 1;
      if (this.telegramEnabled) {
        await this.publishTelegram(asset.shareText);
        published += 1;
      }
    }
    return { created, published };
  }

  async publishTelegram(text: string): Promise<void> {
    const client = new ProviderHttpClient({ provider: 'TELEGRAM', baseUrl: `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/`, perMinute: 20, maxRetries: 2 });
    await client.get('sendMessage', { chat_id: this.env.TELEGRAM_CHANNEL_ID, text, disable_web_page_preview: 'false' }, 0);
  }
}
