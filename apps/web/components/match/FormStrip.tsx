import type { FormItem } from '@/lib/api';

const STYLE = { W: 'bg-positive/15 text-positive', D: 'bg-white/10 text-muted', L: 'bg-negative/15 text-negative' } as const;
const LABEL = { W: 'G', D: 'E', L: 'P' } as const;

export function FormStrip({ items }: { items: FormItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">Sin partidos previos registrados.</p>;
  return (
    <ol className="flex gap-1.5" aria-label="Forma reciente, más reciente primero">
      {items.map((m) => (
        <li key={m.fixtureId} title={`${m.venue === 'H' ? 'vs' : '@'} ${m.opponent}: ${m.goalsFor}-${m.goalsAgainst}`} className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold ${STYLE[m.result]}`}>
          {LABEL[m.result]}
          <span className="sr-only">
            {m.result === 'W' ? 'Ganó' : m.result === 'D' ? 'Empató' : 'Perdió'} {m.goalsFor}-{m.goalsAgainst} contra {m.opponent}
          </span>
        </li>
      ))}
    </ol>
  );
}
