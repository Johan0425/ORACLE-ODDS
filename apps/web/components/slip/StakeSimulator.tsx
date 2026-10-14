'use client';

import { useMemo, useState } from 'react';
import { BANKROLL_WARNING, simulateBankroll, suggestStake, type StakingMethod } from '@oracle-odds/probability-engine';
import { pct } from '@/lib/format';

/**
 * Calculadora educativa: unidades, Kelly fraccional (0.25 por defecto, tope 2 u),
 * límites diarios/semanales y simulación Monte Carlo. Sin martingalas ni
 * recuperación de pérdidas; no ejecuta nada.
 */
export function StakeSimulator({ probability, odds }: { probability: number | null; odds: number }) {
  const [method, setMethod] = useState<StakingMethod>('fractional_kelly');
  const [fraction, setFraction] = useState(0.25);
  const [maxUnits, setMaxUnits] = useState(2);
  const [daily, setDaily] = useState(5);
  const [weekly, setWeekly] = useState(15);
  const config = { method, kellyFraction: fraction, maxUnitsPerBet: maxUnits, dailyLimitUnits: daily, weeklyLimitUnits: weekly };
  const suggestion = probability != null ? suggestStake(probability, odds, config) : null;
  const sim = useMemo(() => (probability != null ? simulateBankroll({ probability, odds }, 100, config, 1000, 11) : null), [probability, odds, method, fraction, maxUnits, daily, weekly]); // eslint-disable-line react-hooks/exhaustive-deps

  if (probability == null) return <p className="text-xs text-muted">El simulador necesita la probabilidad del modelo para esta selección.</p>;
  return (
    <div className="space-y-3 text-sm" data-testid="stake-simulator">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="col-span-2">
          Método
          <select className="input mt-1" value={method} onChange={(e) => setMethod(e.target.value as StakingMethod)}>
            <option value="fractional_kelly">Kelly fraccional</option>
            <option value="units">Unidades fijas</option>
            <option value="flat">Stake plano</option>
          </select>
        </label>
        {method === 'fractional_kelly' && (
          <label>
            Fracción de Kelly
            <input className="input mt-1" type="number" min={0.05} max={0.5} step={0.05} value={fraction} onChange={(e) => setFraction(Math.min(0.5, Number(e.target.value)))} />
          </label>
        )}
        <label>
          Máx. u/selección
          <input className="input mt-1" type="number" min={0.25} max={2} step={0.25} value={maxUnits} onChange={(e) => setMaxUnits(Math.min(2, Number(e.target.value)))} />
        </label>
        <label>
          Límite diario (u)
          <input className="input mt-1" type="number" min={1} max={20} value={daily} onChange={(e) => setDaily(Number(e.target.value))} />
        </label>
        <label>
          Límite semanal (u)
          <input className="input mt-1" type="number" min={1} max={60} value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} />
        </label>
      </div>
      {suggestion && (
        <p className="rounded-lg bg-surface-2 p-3">
          Stake simulado: <strong className="text-gold-soft">{suggestion.units.toFixed(2)} unidades</strong>
          <span className="block text-xs text-muted">{suggestion.cappedBy === 'no_edge' ? 'Sin valor esperado positivo: el método sugiere no participar.' : suggestion.reason}</span>
        </p>
      )}
      {sim && (
        <p className="text-xs text-muted">
          Simulación de 100 selecciones similares (1.000 escenarios): mediana final {sim.medianFinal.toFixed(1)} u de 100; probabilidad de terminar en pérdida {pct(sim.probabilityOfLoss, 0)}; drawdown medio {pct(sim.averageMaxDrawdown, 0)}.
        </p>
      )}
      <p className="text-xs text-warning">{BANKROLL_WARNING}</p>
    </div>
  );
}
