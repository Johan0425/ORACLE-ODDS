'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { apiPost, type SponsorConfig } from '@/lib/api';
import { SponsoredTag } from '../ui/Badges';

const CAP_KEY = 'oo_sponsor_impressions';

function underCap(placement: string, cap: number): boolean {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = JSON.parse(window.localStorage.getItem(CAP_KEY) ?? '{}') as Record<string, number>;
    const k = `${today}:${placement}`;
    if ((raw[k] ?? 0) >= cap) return false;
    window.localStorage.setItem(CAP_KEY, JSON.stringify({ [k]: (raw[k] ?? 0) + 1 }));
    return true;
  } catch {
    return true;
  }
}

/**
 * Pieza patrocinada configurable (no codificada en las páginas): solo aparece
 * si la API la habilita para esa ubicación, respeta el tope de frecuencia y
 * siempre va rotulada como contenido patrocinado con avisos 18+.
 */
export function SponsorBanner({ config, variant = 'card', headline }: { config: SponsorConfig | null; variant?: 'card' | 'inline' | 'hero'; headline?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!config?.enabled) return;
    if (underCap(config.placement, config.frequencyCap * (variant === 'inline' ? 3 : 1))) {
      setShow(true);
      void apiPost('/affiliate/impression', { placement: config.placement, bookmaker: config.slug });
    }
  }, [config, variant]);
  if (!config?.enabled || !show) return null;
  const href = `/go?bookmaker=${config.slug}&placement=${config.placement}`;
  return (
    <aside aria-label={`Contenido patrocinado por ${config.name}`} className={variant === 'inline' ? 'rounded-xl border border-warning/20 bg-surface-2 p-3' : 'card border-warning/25 p-5'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {config.logoUrl ? <img src={config.logoUrl} alt={config.name} className="h-8 w-auto" /> : <span className="font-display text-lg font-bold text-foreground">{config.name}</span>}
          <SponsoredTag kind="patrocinado" />
        </div>
        <a href={href} rel="sponsored nofollow noopener" target="_blank" className="btn-primary">
          {headline ?? `Visitar ${config.name}`}
        </a>
      </div>
      <p className="mt-3 text-xs text-muted">
        {config.disclosure} {config.responsibleGamingText}
        {config.licenseLabel ? ` · ${config.licenseLabel}` : ''}
      </p>
    </aside>
  );
}
