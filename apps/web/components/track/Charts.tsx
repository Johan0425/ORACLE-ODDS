'use client';

import { LineChart } from '../odds/LineChart';
import { formatKickoff, pct } from '@/lib/format';

export function EquityChart({ points }: { points: Array<{ at: string; units: number }> }) {
  const series = [{ id: 'equity', label: 'Beneficio acumulado (u)', points: points.filter((p) => p.at).map((p) => ({ x: Date.parse(p.at), y: p.units })) }];
  return <LineChart series={series} baseline={0} ariaLabel="Beneficio acumulado en unidades a stake plano" formatX={(x) => formatKickoff(new Date(x).toISOString(), { day: 'numeric', month: 'short' })} formatY={(y) => `${y.toFixed(1)} u`} />;
}

export function CalibrationChart({ bins }: { bins: Array<{ meanPredicted: number; observedRate: number; count: number }> }) {
  const series = [{ id: 'cal', label: 'Frecuencia observada', points: bins.filter((b) => b.count > 0).map((b) => ({ x: b.meanPredicted, y: b.observedRate })) }];
  return <LineChart series={series} diagonal dots ariaLabel="Curva de calibración: probabilidad predicha frente a frecuencia observada" formatX={(x) => pct(x, 0)} formatY={(y) => pct(y, 0)} height={260} />;
}
