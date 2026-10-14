import type { FixtureDetail, Predictions } from '@/lib/api';
import { odds, pct, selectionName } from '@/lib/format';
import { ConfidenceBadge } from '../ui/Badges';
import { AddToSlipButton } from '../odds/AddToSlipButton';

/** Mercados publicados con probabilidad calibrada, intervalo y cuota justa. Los no validados se muestran como tales, sin cifras. */
export function PredictionsPanel({ fixture, predictions, bestPrices }: { fixture: FixtureDetail; predictions: Predictions; bestPrices: Record<string, { price: number; bookmaker: string }> }) {
  const home = fixture.homeTeam.name;
  const away = fixture.awayTeam.name;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {predictions.markets.map((m) => (
        <details key={m.marketKey} className="card group p-4" aria-label={m.displayName} open={m.selections.length <= 4}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <h3 className="font-semibold">{m.displayName}</h3>
            {!m.publication.published ? (
              <span className="chip border-warning/40 text-warning">No publicado</span>
            ) : m.selections.length > 4 ? (
              <span className="chip">
                <span className="group-open:hidden">Ver {m.selections.length} selecciones</span>
                <span className="hidden group-open:inline">Ocultar</span>
              </span>
            ) : null}
          </summary>
          {!m.publication.published ? (
            <p className="mt-2 text-sm text-muted">{m.publication.reason}. No mostramos cifras de mercados sin validación suficiente.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {m.selections.map((s) => {
                const key = `${s.marketKey}|${s.line == null ? '' : String(Math.round(s.line * 4) / 4)}|${s.selectionKey}`;
                const best = bestPrices[key];
                const label = selectionName(s.marketKey, s.selectionKey, s.line, home, away);
                return (
                  <li key={s.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{label}</span>
                      <span className="tabular font-bold text-gold-soft">{pct(s.calibratedProbability)}</span>
                    </div>
                    <div className="tabular mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>Rango {pct(s.uncertaintyLower, 0)}–{pct(s.uncertaintyUpper, 0)}</span>
                      <span>Cuota justa {odds(s.fairOdds)}</span>
                      {best && <span>Mejor cuota {odds(best.price)}</span>}
                      <ConfidenceBadge level={s.confidenceLevel} value={s.confidence} />
                      {!s.isCalibrated && <span className="text-warning">sin calibrar</span>}
                    </div>
                    {best && fixture.status === 'SCHEDULED' && (
                      <div className="mt-2">
                        <AddToSlipButton compact leg={{ fixtureId: fixture.id, marketKey: s.marketKey, selectionKey: s.selectionKey, line: s.line, odds: best.price, bookmaker: best.bookmaker, probability: s.calibratedProbability, label: `${m.displayName}: ${label}`, fixtureLabel: `${home} vs ${away}`, kickoff: fixture.kickoff }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}
