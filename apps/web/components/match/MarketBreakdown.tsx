import { ProbabilityGauge } from './ProbabilityGauge';
import { cn } from '@/lib/cn';
import { SELECTION_LABEL, type ApiProbability } from '@/lib/api';

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-neon/15 text-neon border-neon/30',
  medium: 'bg-gold/15 text-gold border-gold/30',
  low: 'bg-white/10 text-white/60 border-white/15',
};

const CONFIDENCE_LABEL: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

/** Un mercado completo (todas sus selecciones) con la justificación estadística visible por defecto, no oculta en un tooltip. */
export function MarketBreakdown({ title, outcomes }: { title: string; outcomes: ApiProbability[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-6">
      <h3 className="mb-5 font-display text-lg font-bold text-foreground">{title}</h3>
      <div className="space-y-5">
        {outcomes.map((outcome) => (
          <div key={`${outcome.selection}-${outcome.line}`} className="flex gap-4">
            <ProbabilityGauge probability={outcome.probability} />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {SELECTION_LABEL[outcome.selection] ?? outcome.selection}
                  {outcome.line != null && ` ${outcome.line}`}
                </span>
                <span className="font-display text-lg font-bold text-foreground">
                  {Math.round(outcome.probability * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/50">{outcome.explanation}</p>
              <span
                className={cn(
                  'mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  CONFIDENCE_STYLES[outcome.confidence],
                )}
              >
                Confianza {CONFIDENCE_LABEL[outcome.confidence] ?? outcome.confidence}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
