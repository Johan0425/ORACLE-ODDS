import { relativeAge } from '@/lib/format';

const CONF_STYLE = {
  HIGH: 'border-positive/40 bg-positive/10 text-positive',
  MEDIUM: 'border-gold/40 bg-gold/10 text-gold-soft',
  LOW: 'border-white/20 bg-white/5 text-muted',
} as const;
const CONF_LABEL = { HIGH: 'Confianza alta', MEDIUM: 'Confianza media', LOW: 'Confianza baja' } as const;

export function ConfidenceBadge({ level, value }: { level: 'LOW' | 'MEDIUM' | 'HIGH' | null | undefined; value?: number }) {
  const l = level ?? (value == null ? 'LOW' : value >= 0.7 ? 'HIGH' : value >= 0.45 ? 'MEDIUM' : 'LOW');
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${CONF_STYLE[l]}`} title={value != null ? `Índice de confianza ${(value * 100).toFixed(0)}/100` : undefined}>
      <span aria-hidden>●</span> {CONF_LABEL[l]}
    </span>
  );
}

/** Frescura de un dato con umbrales explícitos; nunca presenta como "tiempo real" un dato retrasado. */
export function FreshnessBadge({ ageSeconds, staleAfter = 7200, freshUntil = 900, live = false }: { ageSeconds: number | null; staleAfter?: number; freshUntil?: number; live?: boolean }) {
  const state = ageSeconds == null ? 'unknown' : ageSeconds >= staleAfter ? 'stale' : ageSeconds <= freshUntil ? 'fresh' : 'aging';
  const style = { fresh: 'text-positive', aging: 'text-warning', stale: 'text-negative', unknown: 'text-muted' }[state];
  const label = { fresh: live ? 'Actualizado' : 'Reciente', aging: 'Envejeciendo', stale: 'Vencido', unknown: 'Sin dato' }[state];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${style}`} title={`${label}: ${relativeAge(ageSeconds)}`}>
      <span aria-hidden className={state === 'fresh' && live ? 'animate-pulse-dot' : ''}>●</span>
      <span className="text-muted">{relativeAge(ageSeconds)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function SponsoredTag({ kind = 'afiliado' }: { kind?: 'afiliado' | 'patrocinado' }) {
  return (
    <span className="rounded border border-warning/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-warning" title="Enlace comercial: podemos recibir una comisión">
      {kind === 'afiliado' ? 'Enlace de afiliado' : 'Patrocinado'}
    </span>
  );
}

export function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-negative">
      <span aria-hidden className="h-2 w-2 animate-pulse-dot rounded-full bg-negative" />
      En vivo
    </span>
  );
}
