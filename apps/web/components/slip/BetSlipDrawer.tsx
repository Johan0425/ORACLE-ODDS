'use client';

import { useEffect, useRef, useState } from 'react';
import { useBetSlip } from '@/lib/betslip-store';
import { apiGet, type SponsorConfig } from '@/lib/api';
import { BetSlipPanel } from './BetSlipPanel';
import { SponsorBanner } from '../compliance/SponsorBanner';

export function BetSlipDrawer() {
  const open = useBetSlip((s) => s.open);
  const setOpen = useBetSlip((s) => s.setOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [sponsor, setSponsor] = useState<SponsorConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    if (!sponsor) apiGet<SponsorConfig>('/sponsor/config?placement=bet_slip').then((r) => r.ok && setSponsor(r.data));
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen, sponsor]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button type="button" aria-label="Cerrar slip" className="absolute inset-0 bg-background/70" onClick={() => setOpen(false)} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="slip-title" className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl" data-testid="slip-drawer">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="slip-title" className="font-display text-xl font-bold">Bet Slip</h2>
          <button type="button" className="btn-ghost px-3" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
        </div>
        <BetSlipPanel sponsorSlot={<SponsorBanner config={sponsor} variant="inline" />} />
      </div>
    </div>
  );
}
