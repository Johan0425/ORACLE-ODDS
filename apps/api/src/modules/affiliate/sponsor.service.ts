import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';

export const SPONSOR_PLACEMENTS = [
  'hero_secondary',
  'below_comparator',
  'bet_slip',
  'landing',
  'share_footer',
  'challenge_sponsor',
  'post_analysis',
  'newsletter',
] as const;
export type SponsorPlacement = (typeof SPONSOR_PLACEMENTS)[number];

export interface SponsorPublicConfig {
  enabled: boolean;
  slug: string;
  name: string;
  logoUrl: string | null;
  placement: string;
  disclosure: string;
  ageRestriction: number;
  responsibleGamingText: string;
  allowedCountries: string[];
  frequencyCap: number;
  showOnShares: boolean;
  licenseLabel: string | null;
  campaign: string | null;
  startsAt: string | null;
  endsAt: string | null;
  disabledReason?: string;
}

export const SPONSOR_SLUG = 'betsantander';

/**
 * Configuración central del patrocinio. Toda la publicidad del frontend pasa
 * por aquí: nada está codificado en las páginas. En producción solo se activa
 * si además se registró la fecha de verificación legal (BET_SANTANDER_VERIFIED_AT).
 */
@Injectable()
export class SponsorService {
  private readonly logger = new Logger(SponsorService.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  status(now = new Date()): { enabled: boolean; reason?: string } {
    const e = this.env;
    if (!e.BET_SANTANDER_ENABLED) return { enabled: false, reason: 'Desactivado por feature flag' };
    if (!e.BET_SANTANDER_URL) return { enabled: false, reason: 'Falta BET_SANTANDER_URL' };
    if (e.NODE_ENV === 'production' && !e.BET_SANTANDER_VERIFIED_AT) {
      return { enabled: false, reason: 'Falta verificación legal (BET_SANTANDER_VERIFIED_AT): identidad, licencia y acuerdo de afiliación' };
    }
    if (e.BET_SANTANDER_STARTS_AT && new Date(e.BET_SANTANDER_STARTS_AT) > now) return { enabled: false, reason: 'Campaña aún no iniciada' };
    if (e.BET_SANTANDER_ENDS_AT && new Date(e.BET_SANTANDER_ENDS_AT) < now) return { enabled: false, reason: 'Campaña finalizada' };
    return { enabled: true };
  }

  placements(): string[] {
    return this.env.BET_SANTANDER_PLACEMENTS.split(',').map((p) => p.trim()).filter(Boolean);
  }

  publicConfig(placement: string): SponsorPublicConfig {
    const s = this.status();
    const placementAllowed = this.placements().includes(placement);
    const enabled = s.enabled && placementAllowed;
    return {
      enabled,
      slug: SPONSOR_SLUG,
      name: 'BetSantander',
      logoUrl: this.env.BET_SANTANDER_LOGO_URL ?? null,
      placement,
      disclosure: 'Contenido patrocinado. ORACLE ODDS puede recibir una comisión si te registras a través de este enlace. Esto no modifica nuestras estimaciones.',
      ageRestriction: 18,
      responsibleGamingText: 'Solo para mayores de 18 años. Jugar sin control puede generar adicción. Juega con responsabilidad.',
      allowedCountries: this.env.BET_SANTANDER_ALLOWED_COUNTRIES.split(',').map((c) => c.trim().toUpperCase()),
      frequencyCap: this.env.BET_SANTANDER_FREQUENCY_CAP,
      showOnShares: this.env.BET_SANTANDER_SHOW_ON_SHARES,
      licenseLabel: this.env.BET_SANTANDER_LICENSE_LABEL ?? null,
      campaign: this.env.BET_SANTANDER_CAMPAIGN ?? null,
      startsAt: this.env.BET_SANTANDER_STARTS_AT ?? null,
      endsAt: this.env.BET_SANTANDER_ENDS_AT ?? null,
      ...(enabled ? {} : { disabledReason: s.reason ?? 'Ubicación no habilitada' }),
    };
  }

  /** URL de destino con parámetros de afiliado, subID por ubicación y click ID. */
  destinationUrl(params: { placement: string; clickId: string; utmSource?: string; utmMedium?: string; utmCampaign?: string }): string | null {
    if (!this.status().enabled || !this.env.BET_SANTANDER_URL) return null;
    const url = new URL(this.env.BET_SANTANDER_URL);
    if (this.env.BET_SANTANDER_AFFILIATE_ID) url.searchParams.set(this.env.BET_SANTANDER_AFFILIATE_PARAM, this.env.BET_SANTANDER_AFFILIATE_ID);
    url.searchParams.set(this.env.BET_SANTANDER_SUBID_PARAM, params.placement);
    url.searchParams.set(this.env.BET_SANTANDER_CLICKID_PARAM, params.clickId);
    url.searchParams.set('utm_source', params.utmSource ?? 'oracle-odds');
    url.searchParams.set('utm_medium', params.utmMedium ?? 'affiliate');
    url.searchParams.set('utm_campaign', params.utmCampaign ?? this.env.BET_SANTANDER_CAMPAIGN ?? 'sponsor');
    return url.toString();
  }
}
