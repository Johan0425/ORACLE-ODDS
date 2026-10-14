import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { publicCode, safeEqual } from '../../common/hashing';
import { affiliateClicksCounter } from '../../common/metrics';
import { SponsorService, SPONSOR_SLUG } from './sponsor.service';

export interface ClickInput {
  bookmaker: string;
  placement: string;
  fixtureId?: string;
  valueBetId?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

const PLACEMENT_RE = /^[a-z0-9_:-]{2,40}$/;

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService, private readonly sponsor: SponsorService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  private async sponsorBookmaker() {
    return this.prisma.bookmaker.upsert({
      where: { slug: SPONSOR_SLUG },
      create: { slug: SPONSOR_SLUG, name: 'BetSantander', websiteUrl: this.env.BET_SANTANDER_URL ?? null, logoUrl: this.env.BET_SANTANDER_LOGO_URL ?? null, licenseLabel: this.env.BET_SANTANDER_LICENSE_LABEL ?? null, isAuthorized: false, isActive: true },
      update: { websiteUrl: this.env.BET_SANTANDER_URL ?? undefined, logoUrl: this.env.BET_SANTANDER_LOGO_URL ?? undefined, licenseLabel: this.env.BET_SANTANDER_LICENSE_LABEL ?? undefined },
    });
  }

  /**
   * Registra el clic server-side y devuelve la URL de destino. Solo casas
   * autorizadas (o el patrocinador activo y verificado) tienen destino.
   */
  async click(input: ClickInput, anonymousSessionHash: string): Promise<{ clickId: string; redirectUrl: string; sponsored: boolean }> {
    if (!PLACEMENT_RE.test(input.placement)) throw new BadRequestException('placement inválido');
    const clickId = `${Date.now().toString(36)}${publicCode(6)}`.toLowerCase();
    let bookmakerId: string;
    let redirectUrl: string | null;
    const sponsored = input.bookmaker === SPONSOR_SLUG;
    if (sponsored) {
      redirectUrl = this.sponsor.destinationUrl({ placement: input.placement, clickId, utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign });
      if (!redirectUrl) throw new ForbiddenException('Patrocinio desactivado');
      bookmakerId = (await this.sponsorBookmaker()).id;
    } else {
      const book = await this.prisma.bookmaker.findUnique({ where: { slug: input.bookmaker } });
      if (!book || !book.isAuthorized || !book.isActive) throw new NotFoundException('Operador no disponible');
      let direct: string | null = null;
      if (input.fixtureId) {
        const quote = await this.prisma.oddsQuote.findFirst({ where: { fixtureId: input.fixtureId, bookmakerId: book.id, directBetUrl: { not: null } }, orderBy: { lastSeenAt: 'desc' } });
        direct = quote?.directBetUrl ?? null;
      }
      redirectUrl = book.affiliateUrl ?? direct ?? book.websiteUrl;
      if (!redirectUrl) throw new NotFoundException('El operador no tiene enlace configurado');
      bookmakerId = book.id;
    }
    await this.prisma.affiliateClick.create({
      data: {
        clickId,
        bookmakerId,
        fixtureId: input.fixtureId ?? null,
        valueBetId: input.valueBetId ?? null,
        placement: input.placement,
        subId: input.placement,
        campaign: sponsored ? (this.env.BET_SANTANDER_CAMPAIGN ?? null) : null,
        anonymousSessionHash,
        referrer: input.referrer?.slice(0, 300) ?? null,
        utmSource: input.utmSource?.slice(0, 80) ?? null,
        utmMedium: input.utmMedium?.slice(0, 80) ?? null,
        utmCampaign: input.utmCampaign?.slice(0, 80) ?? null,
      },
    });
    affiliateClicksCounter.inc({ bookmaker: input.bookmaker, placement: input.placement });
    return { clickId, redirectUrl, sponsored };
  }

  async impression(placement: string, bookmakerSlug: string): Promise<void> {
    if (!PLACEMENT_RE.test(placement) || !/^[a-z0-9-]{2,40}$/.test(bookmakerSlug)) return;
    const date = new Date(new Date().toISOString().slice(0, 10));
    await this.prisma.affiliateImpressionDaily.upsert({
      where: { date_placement_bookmakerSlug: { date, placement, bookmakerSlug } },
      create: { date, placement, bookmakerSlug, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  /**
   * Postback de conversión. Solo se acepta firmado (HMAC-SHA256 del cuerpo con
   * BET_SANTANDER_POSTBACK_SECRET) y solo si el operador ofrece documentación
   * oficial de postback. Nunca se simulan conversiones.
   */
  async postback(rawBody: string, signature: string | undefined, payload: { clickId: string; event: string; externalRef: string; payoutCents?: number; currency?: string }) {
    const secret = this.env.BET_SANTANDER_POSTBACK_SECRET;
    if (!secret) throw new NotFoundException('Postback no habilitado');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!signature || !safeEqual(signature, expected)) throw new ForbiddenException('Firma inválida');
    const click = await this.prisma.affiliateClick.findUnique({ where: { clickId: payload.clickId } });
    if (!click) throw new NotFoundException('clickId desconocido');
    await this.prisma.affiliateConversion.upsert({
      where: { externalRef: payload.externalRef },
      create: { clickId: payload.clickId, bookmakerId: click.bookmakerId, eventType: payload.event, externalRef: payload.externalRef, payoutCents: payload.payoutCents ?? null, currency: payload.currency ?? null },
      update: {},
    });
    return { accepted: true };
  }

  async stats(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [clicks, impressions, conversions] = await Promise.all([
      this.prisma.affiliateClick.groupBy({ by: ['placement', 'bookmakerId'], where: { clickedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.affiliateImpressionDaily.groupBy({ by: ['placement', 'bookmakerSlug'], where: { date: { gte: since } }, _sum: { count: true } }),
      this.prisma.affiliateConversion.count({ where: { receivedAt: { gte: since } } }),
    ]);
    const books = await this.prisma.bookmaker.findMany({ where: { id: { in: clicks.map((c) => c.bookmakerId) } }, select: { id: true, slug: true } });
    const slug = new Map(books.map((b) => [b.id, b.slug]));
    const rows = clicks.map((c) => {
      const s = slug.get(c.bookmakerId) ?? '?';
      const imp = impressions.find((i) => i.placement === c.placement && i.bookmakerSlug === s)?._sum.count ?? 0;
      return { placement: c.placement, bookmaker: s, clicks: c._count._all, impressions: imp, ctr: imp > 0 ? c._count._all / imp : null };
    });
    return { since, rows, verifiedConversions: conversions };
  }
}
