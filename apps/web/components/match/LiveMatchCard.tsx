import Link from 'next/link';
import type { LiveFixture } from '@/lib/api';
import { pct, relativeAge } from '@/lib/format';
import { LiveDot } from '../ui/Badges';
import { TeamLogo } from '../ui/TeamLogo';

/** Tarjeta en vivo: marcador, minuto, eventos, antigüedad del dato y prob. prepartido vs actualizada. */
export function LiveMatchCard({ f }: { f: LiveFixture }) {
  return (
    <article className="card p-5" data-testid="live-card">
      <header className="flex items-center justify-between text-xs text-muted">
        <span className="truncate">{f.league.name}</span>
        {f.status === 'SUSPENDED' ? <span className="text-warning">Suspendido</span> : <LiveDot />}
      </header>
      <Link href={`/matches/${f.id}`} className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="flex items-center gap-2">
          <TeamLogo name={f.homeTeam.name} src={f.homeTeam.logoUrl} />
          <span className="truncate font-semibold">{f.homeTeam.name}</span>
        </span>
        <span className="tabular rounded-lg bg-surface-2 px-3 py-1 font-display text-2xl font-bold">
          {f.homeScore ?? '–'} : {f.awayScore ?? '–'}
        </span>
        <span className="flex items-center justify-end gap-2">
          <span className="truncate text-right font-semibold">{f.awayTeam.name}</span>
          <TeamLogo name={f.awayTeam.name} src={f.awayTeam.logoUrl} />
        </span>
      </Link>
      <p className="mt-2 text-center text-sm text-gold-soft">
        {f.period === 'HT' ? 'Descanso' : f.elapsedMinutes != null ? `${f.elapsedMinutes}'` : (f.statusDetail ?? 'En juego')}
      </p>
      <p className={`mt-1 text-center text-[11px] ${f.isDelayed ? 'text-warning' : 'text-muted'}`}>
        Dato del proveedor {relativeAge(f.dataAgeSeconds)}
        {f.isDelayed ? ' · posible retraso: no es tiempo real' : ''}
      </p>
      {f.events.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {f.events.slice(0, 3).map((e) => (
            <li key={e.id}>
              {e.minute}&apos; {e.type === 'Goal' ? '⚽' : e.type === 'Card' ? (e.detail?.includes('Red') ? '🟥' : '🟨') : '•'} {e.playerName ?? e.detail}
            </li>
          ))}
        </ul>
      )}
      {f.inPlay && (
        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs">
          <p className="mb-2 text-muted">Probabilidad prepartido → actualizada</p>
          <dl className="tabular grid grid-cols-3 gap-2 text-center">
            {(['HOME', 'DRAW', 'AWAY'] as const).map((k) => (
              <div key={k}>
                <dt className="text-muted">{k === 'HOME' ? 'Local' : k === 'DRAW' ? 'Empate' : 'Visitante'}</dt>
                <dd>
                  {pct(f.inPlay!.prematch[k], 0)} → <span className="font-semibold text-foreground">{pct(f.inPlay!.live[k], 0)}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] text-muted">{f.inPlay.method}</p>
        </div>
      )}
    </article>
  );
}
