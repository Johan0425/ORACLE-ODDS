'use client';

import { useEffect, useState } from 'react';
import { apiGet, type OddsHistory } from '@/lib/api';
import { formatKickoff, odds } from '@/lib/format';
import { LineChart } from './LineChart';
import { Skeleton } from '../ui/Skeleton';

/** Movimiento de la cuota de una selección por casa (hasta 4 casas). */
export function OddsMovementChart({ fixtureId, marketKey, lineKey = '', selectionKey, label }: { fixtureId: string; marketKey: string; lineKey?: string; selectionKey: string; label: string }) {
  const [data, setData] = useState<OddsHistory | null | 'error'>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    apiGet<OddsHistory>(`/fixtures/${fixtureId}/odds-history?market=${marketKey}&line=${encodeURIComponent(lineKey)}&selection=${selectionKey}`, { signal: ctrl.signal }).then((r) => setData(r.ok ? r.data : 'error'));
    return () => ctrl.abort();
  }, [fixtureId, marketKey, lineKey, selectionKey]);
  if (data === null) return <Skeleton className="h-60 w-full" />;
  if (data === 'error') return <p className="text-sm text-muted">Historial de cuotas no disponible.</p>;
  const series = data.series.map((s) => ({ id: s.bookmaker.slug, label: s.bookmaker.name, points: s.points.map((p) => ({ x: Date.parse(p.at), y: p.price })) }));
  return <LineChart series={series} ariaLabel={`Movimiento de cuota: ${label}`} formatX={(x) => formatKickoff(new Date(x).toISOString(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} formatY={(y) => odds(y)} />;
}
