'use client';

import { useState } from 'react';
import type { OddsMarket } from '@/lib/api';
import { selectionName } from '@/lib/format';
import { OddsMovementChart } from '../odds/OddsMovementChart';

export function MovementSection({ fixtureId, markets, home, away }: { fixtureId: string; markets: OddsMarket[]; home: string; away: string }) {
  const options = markets.flatMap((m) => m.selections.map((s) => ({ key: `${m.marketKey}|${m.lineKey}|${s.selectionKey}`, m, s, label: `${m.displayName}${m.line != null ? ` ${m.line}` : ''} — ${selectionName(m.marketKey, s.selectionKey, m.line, home, away)}` })));
  const [value, setValue] = useState(options[0]?.key ?? '');
  const current = options.find((o) => o.key === value);
  if (!current) return <p className="text-sm text-muted">Sin historial de cuotas todavía.</p>;
  return (
    <div className="space-y-3">
      <label className="text-xs text-muted">
        Selección
        <select className="input mt-1 max-w-md" value={value} onChange={(e) => setValue(e.target.value)}>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </label>
      <OddsMovementChart fixtureId={fixtureId} marketKey={current.m.marketKey} lineKey={current.m.lineKey} selectionKey={current.s.selectionKey} label={current.label} />
    </div>
  );
}
