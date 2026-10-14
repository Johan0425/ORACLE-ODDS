import { pct } from '@/lib/format';

/** Anillo de probabilidad con el intervalo de incertidumbre como arco tenue. */
export function ProbabilityGauge({ probability, lower, upper, size = 72, label }: { probability: number; lower?: number | null; upper?: number | null; size?: number; label?: string }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = (p: number) => c * (1 - Math.max(0, Math.min(1, p)));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Probabilidad'} ${pct(probability)}${lower != null && upper != null ? `, intervalo ${pct(lower)} a ${pct(upper)}` : ''}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        {upper != null && <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(217,180,74,0.25)" strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={arc(upper)} />}
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#D9B44A" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={arc(probability)} />
      </svg>
      <span className="tabular absolute font-display text-sm font-bold text-foreground">{pct(probability, 0)}</span>
    </div>
  );
}
