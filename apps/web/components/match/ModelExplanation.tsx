import Link from 'next/link';
import type { Factor, Predictions } from '@/lib/api';
import { formatKickoff, pct } from '@/lib/format';

const DIR = { positive: 'text-positive', negative: 'text-negative', neutral: 'text-muted' } as const;
const ICON = { positive: '▲', negative: '▼', neutral: '•' } as const;

export function ModelExplanation({ run, factors, reductions }: { run: NonNullable<Predictions['run']>; factors: Factor[]; reductions: string[] }) {
  return (
    <section aria-labelledby="model-expl" className="card p-5">
      <h3 id="model-expl" className="font-display text-lg font-bold">Cómo llegó el modelo a estas cifras</h3>
      <p className="mt-1 text-sm text-muted">
        Ensemble estadístico (Dixon-Coles + Elo + consenso de mercado sin margen), no inteligencia artificial generativa. Goles esperados {run.lambdas.home?.toFixed(2) ?? '—'} – {run.lambdas.away?.toFixed(2) ?? '—'} · calidad de datos {pct(run.dataQuality, 0)}.
      </p>
      {factors.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {factors.map((f) => (
            <li key={f.code + f.label} className="flex gap-2">
              <span aria-hidden className={DIR[f.direction]}>{ICON[f.direction]}</span>
              <span>{f.label}</span>
            </li>
          ))}
        </ul>
      )}
      {reductions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-warning">Motivos de menor confianza</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted">
            {reductions.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Versión {run.modelVersion} · datos hasta {formatKickoff(run.dataCutoff)} · generado {formatKickoff(run.generatedAt)} · <Link href="/methodology" className="underline">metodología</Link>
      </p>
    </section>
  );
}
