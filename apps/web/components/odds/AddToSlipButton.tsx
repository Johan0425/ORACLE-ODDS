'use client';

import { legKey, useBetSlip, type SlipLeg } from '@/lib/betslip-store';

export function AddToSlipButton({ leg, compact = false }: { leg: Omit<SlipLeg, 'addedAt'>; compact?: boolean }) {
  const inSlip = useBetSlip((s) => s.legs.some((l) => legKey(l) === legKey(leg)));
  const add = useBetSlip((s) => s.add);
  const remove = useBetSlip((s) => s.remove);
  return (
    <button
      type="button"
      onClick={() => (inSlip ? remove(legKey(leg)) : add(leg))}
      aria-pressed={inSlip}
      className={`${compact ? 'px-2 py-1 text-xs' : ''} btn ${inSlip ? 'border border-gold bg-gold/15 text-gold-soft' : 'border border-line text-foreground hover:border-gold/60'}`}
      data-testid="add-to-slip"
    >
      {inSlip ? '✓ En el slip' : '+ Slip'}
    </button>
  );
}
