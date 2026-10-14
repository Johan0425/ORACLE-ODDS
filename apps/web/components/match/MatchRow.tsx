import Link from 'next/link';
import type { Fixture } from '@/lib/api';
import { formatTime, STATUS_LABEL } from '@/lib/format';
import { TeamLogo } from '../ui/TeamLogo';
import { LiveDot } from '../ui/Badges';

export function MatchRow({ f }: { f: Fixture }) {
  const live = f.status === 'LIVE';
  const showScore = f.homeScore != null && f.awayScore != null && f.status !== 'SCHEDULED';
  return (
    <li>
      <Link href={`/matches/${f.id}`} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2" data-testid="match-row">
        <span className="tabular text-sm text-muted">{live ? <LiveDot /> : f.status === 'SCHEDULED' ? <time dateTime={f.kickoff}>{formatTime(f.kickoff)}</time> : STATUS_LABEL[f.status]}</span>
        <span className="grid gap-1 text-sm">
          <span className="flex items-center gap-2">
            <TeamLogo name={f.homeTeam.name} src={f.homeTeam.logoUrl} size={20} />
            <span className="truncate">{f.homeTeam.name}</span>
          </span>
          <span className="flex items-center gap-2">
            <TeamLogo name={f.awayTeam.name} src={f.awayTeam.logoUrl} size={20} />
            <span className="truncate">{f.awayTeam.name}</span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          {f._count?.valueBets ? <span className="chip border-gold/40 text-gold">{f._count.valueBets} valor</span> : null}
          {showScore ? (
            <span className="tabular grid gap-1 text-right font-bold">
              <span>{f.homeScore}</span>
              <span>{f.awayScore}</span>
            </span>
          ) : (
            <span className="text-xs text-muted">{f._count?.oddsQuotes ? 'Cuotas' : 'Sin cuotas'}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
