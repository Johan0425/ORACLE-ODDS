import Link from 'next/link';
import type { ValueBet } from '@/lib/api';
import { formatKickoff, marketName, odds, pct, points, relativeAge, selectionName, signedPct } from '@/lib/format';
import { ConfidenceBadge, FreshnessBadge, SponsoredTag } from '../ui/Badges';
import { TeamLogo } from '../ui/TeamLogo';
import { ProbabilityGauge } from './ProbabilityGauge';
import { AddToSlipButton } from './AddToSlipButton';
import { ShareButton } from '../share/ShareButton';

/** Oportunidad de valor con todos los datos exigidos para decidir con información completa. */
export function ValueBetCard({ vb }: { vb: ValueBet }) {
  const f = vb.fixture;
  const sel = selectionName(vb.marketKey, vb.selectionKey, vb.line, f.homeTeam.name, f.awayTeam.name);
  const best = vb.comparison[0];
  const current = best?.price ?? vb.price;
  const ageSeconds = best ? (Date.now() - Date.parse(best.updatedAt)) / 1000 : null;
  const movement = best ? best.movementFromOpening : null;
  return (
    <article className="card flex min-w-0 flex-col gap-4 p-5" data-testid="value-bet-card">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">
            {f.league.name} · <time dateTime={f.kickoff}>{formatKickoff(f.kickoff)}</time> (hora Colombia)
          </p>
          <Link href={`/matches/${f.id}`} className="mt-1 flex items-center gap-2 font-semibold hover:text-gold-soft">
            <TeamLogo name={f.homeTeam.name} src={f.homeTeam.logoUrl} size={20} />
            <span className="truncate">
              {f.homeTeam.name} vs {f.awayTeam.name}
            </span>
          </Link>
        </div>
        <span className="tabular shrink-0 rounded-lg bg-gold/10 px-2 py-1 text-xs font-bold text-gold" title="Puntuación de calidad 0-100">
          Q {vb.qualityScore.toFixed(0)}
        </span>
      </header>

      <div className="flex items-center gap-4">
        <ProbabilityGauge probability={vb.probability} lower={vb.uncertainty?.lower} upper={vb.uncertainty?.upper} label="Probabilidad del modelo" />
        <div className="min-w-0 flex-1 break-words">
          <p className="text-xs uppercase tracking-wider text-muted">{marketName(vb.marketKey)}</p>
          <p className="text-lg font-bold">{sel}</p>
          <p className="tabular text-sm">
            Mejor cuota <span className="font-bold text-gold-soft">{odds(current)}</span> en {best?.bookmaker.name ?? vb.bookmakerSlug}
          </p>
        </div>
      </div>

      <dl className="tabular grid grid-cols-3 gap-2 text-center text-xs">
        {[
          ['Prob. modelo', pct(vb.probability)],
          ['Mercado sin vig', pct(vb.marketProbability)],
          ['Cuota justa', odds(vb.fairOdds)],
          ['Edge', points(vb.edge)],
          ['EV', signedPct(vb.expectedValue)],
          ['Desde apertura', movement == null ? '—' : signedPct(movement)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 px-2 py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="mt-0.5 font-semibold text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ConfidenceBadge level={vb.confidenceLevel} value={vb.confidence} />
        <FreshnessBadge ageSeconds={ageSeconds} />
        {vb.uncertainty && (
          <span className="chip">
            Rango {pct(vb.uncertainty.lower, 0)}–{pct(vb.uncertainty.upper, 0)}
          </span>
        )}
        {!vb.isCalibrated && <span className="chip border-warning/40 text-warning">En validación</span>}
      </div>

      {vb.explanation && <p className="text-sm text-muted">{vb.explanation}</p>}

      {vb.comparison.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-foreground">Comparar {vb.comparison.length} casas</summary>
          <ul className="tabular mt-2 space-y-1">
            {vb.comparison.map((c) => (
              <li key={c.bookmaker.slug} className="flex justify-between text-muted">
                <span>{c.bookmaker.name}</span>
                <span>
                  {odds(c.price)} <span className="text-[11px]">(apertura {odds(c.openingPrice)})</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-foreground">Riesgos ({vb.risks.length})</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {vb.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>

      <footer className="mt-auto flex flex-wrap items-center gap-2">
        <AddToSlipButton
          leg={{ fixtureId: f.id, marketKey: vb.marketKey, selectionKey: vb.selectionKey, line: vb.line, odds: current, bookmaker: best?.bookmaker.slug ?? vb.bookmakerSlug, probability: vb.probability, label: `${marketName(vb.marketKey)}: ${sel}`, fixtureLabel: `${f.homeTeam.name} vs ${f.awayTeam.name}`, kickoff: f.kickoff }}
        />
        <ShareButton entityType="value_bet" entityId={vb.id} />
        {best && (
          <a href={`/go?bookmaker=${best.bookmaker.slug}&placement=value_bet&fixtureId=${f.id}`} rel="sponsored nofollow noopener" target="_blank" className="btn-ghost max-w-full flex-wrap text-center">
            Ir a {best.bookmaker.name} <SponsoredTag />
          </a>
        )}
        <Link href="/methodology" className="ml-auto text-xs text-muted underline">
          Metodología
        </Link>
      </footer>
      <p className="text-[11px] text-muted">
        Detectada {relativeAge((Date.now() - Date.parse(vb.detectedAt)) / 1000)} · modelo {vb.predictionRun.modelVersion} · datos hasta {formatKickoff(vb.predictionRun.dataCutoff)}
      </p>
    </article>
  );
}
