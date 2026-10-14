import { odds, pct, signedPct } from '@/lib/format';
import type { AnalyzeResponse } from './types';

const RISK = { LOW: ['Bajo', 'text-positive'], MEDIUM: ['Medio', 'text-gold-soft'], HIGH: ['Alto', 'text-warning'], VERY_HIGH: ['Muy alto', 'text-negative'] } as const;

export function CombinationAnalyzer({ result, mode }: { result: AnalyzeResponse; mode: 'singles' | 'combo' | 'system' }) {
  const a = result.analysis;
  const [riskLabel, riskClass] = RISK[a.riskLevel];
  return (
    <div className="space-y-3 text-sm" data-testid="combo-analysis">
      {a.issues.length > 0 && (
        <ul className="space-y-1">
          {a.issues.map((i, idx) => (
            <li key={idx} role={i.severity === 'block' ? 'alert' : undefined} className={`rounded-lg px-3 py-2 text-xs ${i.severity === 'block' ? 'bg-negative/10 text-negative' : 'bg-warning/10 text-warning'}`}>
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {mode === 'singles' && (
        <ul className="space-y-2">
          {result.singles.map((s) => (
            <li key={s.legId} className="tabular flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
              <span className="truncate">{s.label}</span>
              <span>
                {odds(s.odds)} · ret. {s.potentialReturn.toFixed(2)} u · EV {signedPct(s.expectedValue)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {mode === 'combo' && (
        <dl className="tabular grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Cuota total</dt><dd className="text-lg font-bold text-gold-soft">{odds(a.combinedOdds)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Retorno simulado</dt><dd className="text-lg font-bold">{result.potentialReturn.toFixed(2)} u</dd></div>
          <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Prob. conjunta</dt><dd className="font-semibold">{pct(a.adjustedProbability)}{a.probabilityIsApproximate ? ' (aprox.)' : ''}</dd></div>
          <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Independencia ingenua</dt><dd className="font-semibold">{pct(a.naiveProbability)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">EV estimado</dt><dd className="font-semibold">{signedPct(a.expectedValue)}</dd></div>
          <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Riesgo</dt><dd className={`font-semibold ${riskClass}`}>{riskLabel}</dd></div>
          {a.correlationPenalty > 0 && <div className="col-span-2 text-xs text-warning">Penalización por correlación aplicada: −{pct(a.correlationPenalty, 0)}</div>}
        </dl>
      )}
      {mode === 'combo' && a.legImpact.some((l) => l.riskShare != null) && (
        <div>
          <p className="text-xs text-muted">Impacto de cada selección en el riesgo total</p>
          <ul className="mt-1 space-y-1">
            {a.legImpact.map((l) => {
              const leg = result.legs.find((x) => x.id === l.legId);
              return (
                <li key={l.legId} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{leg?.label}</span>
                    <span className="tabular">{pct(l.riskShare, 0)}</span>
                  </div>
                  <div aria-hidden className="mt-0.5 h-1.5 rounded bg-surface-2">
                    <div className="h-1.5 rounded bg-gold" style={{ width: `${Math.round((l.riskShare ?? 0) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {mode === 'system' &&
        (result.systems.length === 0 ? (
          <p className="text-xs text-muted">Necesitas al menos 3 selecciones para un sistema.</p>
        ) : (
          result.systems.map((s) => (
            <dl key={s.name} className="tabular grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3 text-xs">
              <dt className="text-muted">Sistema</dt><dd className="font-semibold">{s.name} · {s.combinations} combinadas</dd>
              <dt className="text-muted">Stake por combinada</dt><dd>{s.stakePerCombination.toFixed(2)} u</dd>
              <dt className="text-muted">Retorno máximo</dt><dd>{s.maxReturn.toFixed(2)} u</dd>
              <dt className="text-muted">Retorno esperado</dt><dd>{s.expectedReturn == null ? '—' : `${s.expectedReturn.toFixed(2)} u`}</dd>
              <dt className="text-muted">P(algún retorno)</dt><dd>{pct(s.probabilityAnyReturn)}</dd>
              {!s.valid && <dd className="col-span-2 text-warning">Hay selecciones del mismo partido: el sistema asume independencia y no es fiable.</dd>}
            </dl>
          ))
        ))}
      <p className="text-[11px] text-muted">{result.disclaimer}</p>
    </div>
  );
}
