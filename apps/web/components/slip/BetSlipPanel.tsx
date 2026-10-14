'use client';

import { useCallback, useState } from 'react';
import { apiPost } from '@/lib/api';
import { legKey, useBetSlip } from '@/lib/betslip-store';
import { formatKickoff, odds } from '@/lib/format';
import { COMPLIANCE } from '@/lib/compliance';
import { CombinationAnalyzer } from './CombinationAnalyzer';
import { StakeSimulator } from './StakeSimulator';
import { ShareComposer } from '../share/ShareComposer';
import type { AnalyzeResponse } from './types';

/** Contenido del Bet Slip (sin dinero real). Se usa en el panel lateral y en /builder. */
export function BetSlipPanel({ sponsorSlot }: { sponsorSlot?: React.ReactNode }) {
  const { legs, remove, clear, stakeUnits, setStake, replace } = useBetSlip();
  const [mode, setMode] = useState<'singles' | 'combo' | 'system'>('combo');
  const [systemSize, setSystemSize] = useState(2);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);

  const analyze = useCallback(
    async (save = false) => {
      setLoading(true);
      setError(null);
      const r = await apiPost<AnalyzeResponse>('/combinations/analyze', {
        legs: legs.map((l) => ({ fixtureId: l.fixtureId, marketKey: l.marketKey, selectionKey: l.selectionKey, line: l.line, odds: l.odds, bookmaker: l.bookmaker ?? undefined })),
        systemSizes: mode === 'system' ? [systemSize] : [],
        stakeUnits,
        save,
      });
      setLoading(false);
      if (!r.ok) return setError(r.error);
      setResult(r.data);
      // Actualiza cuotas y probabilidades del slip con las vigentes.
      replace(legs.map((l, i) => ({ ...l, odds: r.data.legs[i]?.odds ?? l.odds, probability: r.data.legs[i]?.probability ?? l.probability })));
      if (save && r.data.publicCode) setShareCode(r.data.publicCode);
    },
    [legs, mode, systemSize, stakeUnits, replace],
  );

  if (legs.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">Tu slip está vacío. Agrega selecciones desde un partido, el comparador o las oportunidades.</p>;
  }

  const singleLeg = legs.length === 1 ? legs[0] : null;
  return (
    <div className="space-y-4">
      <ul className="space-y-2" aria-label="Selecciones">
        {legs.map((l) => (
          <li key={legKey(l)} className="rounded-xl border border-line bg-surface-2 p-3 text-sm" data-testid="slip-leg">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.label}</p>
                <p className="truncate text-xs text-muted">
                  {l.fixtureLabel} · {formatKickoff(l.kickoff)}
                </p>
              </div>
              <span className="tabular font-bold text-gold-soft">{odds(l.odds)}</span>
              <button type="button" onClick={() => remove(legKey(l))} className="text-muted hover:text-negative" aria-label={`Quitar ${l.label}`}>
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div role="tablist" aria-label="Tipo de jugada simulada" className="grid grid-cols-3 gap-1 rounded-full border border-line p-1 text-xs">
        {(
          [
            ['singles', 'Sencillas'],
            ['combo', 'Combinada'],
            ['system', 'Sistema'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} type="button" onClick={() => setMode(k)} className={`rounded-full px-2 py-1.5 ${mode === k ? 'bg-gold text-background' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label>
          Stake simulado (unidades)
          <input className="input mt-1 w-28" type="number" min={0.1} max={100} step={0.5} value={stakeUnits} onChange={(e) => setStake(Number(e.target.value))} />
        </label>
        {mode === 'system' && (
          <label>
            Sistema
            <select className="input mt-1 w-28" value={systemSize} onChange={(e) => setSystemSize(Number(e.target.value))}>
              {Array.from({ length: Math.max(0, legs.length - 2) }, (_, i) => i + 2).map((k) => (
                <option key={k} value={k}>
                  {k}/{legs.length}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => analyze(false)} disabled={loading} data-testid="slip-analyze">
          {loading ? 'Actualizando…' : 'Actualizar cuotas y analizar'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => analyze(true)} disabled={loading || legs.length < 2} data-testid="slip-share">
          Compartir combinada
        </button>
        <button type="button" className="btn-ghost" onClick={() => (clear(), setResult(null))}>
          Vaciar
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {result && <CombinationAnalyzer result={result} mode={mode} />}

      {singleLeg && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm">Calculadora de bankroll (educativa)</summary>
          <div className="mt-3">
            <StakeSimulator probability={singleLeg.probability} odds={singleLeg.odds} />
          </div>
        </details>
      )}
      {sponsorSlot}
      <p className="text-[11px] text-muted">
        Simulación sin dinero real. ORACLE ODDS no recibe apuestas. {COMPLIANCE.oddsChange}
      </p>
      {shareCode && <ShareComposer entityType="combination" entityId={shareCode} onClose={() => setShareCode(null)} />}
    </div>
  );
}
