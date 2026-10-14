import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, type FixtureList, type League, type Sport } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { MatchRow } from '@/components/match/MatchRow';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Calendario de partidos', description: 'Partidos reales de hoy, mañana y los próximos siete días con cuotas comparadas.' };
export const revalidate = 60;

const RANGES = [
  { key: 'today', label: 'Hoy' },
  { key: 'tomorrow', label: 'Mañana' },
  { key: 'week', label: 'Próximos 7 días' },
];

type SP = Promise<{ date?: string; sport?: string; leagueId?: string; q?: string }>;

export default async function MatchesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const date = RANGES.some((r) => r.key === sp.date) ? sp.date! : 'today';
  const qs = new URLSearchParams({ date, limit: '100' });
  if (sp.sport) qs.set('sport', sp.sport);
  if (sp.leagueId) qs.set('leagueId', sp.leagueId);
  if (sp.q) qs.set('q', sp.q.slice(0, 60));
  const [list, leagues, sports] = await Promise.all([apiGet<FixtureList>(`/fixtures?${qs}`), apiGet<League[]>('/leagues', { revalidate: 600 }), apiGet<Sport[]>('/sports', { revalidate: 600 })]);

  const groups = new Map<string, Map<string, FixtureList['items']>>();
  if (list.ok) {
    for (const f of list.data.items) {
      const day = formatDay(f.kickoff);
      const byLeague = groups.get(day) ?? new Map();
      byLeague.set(f.league.name, [...(byLeague.get(f.league.name) ?? []), f]);
      groups.set(day, byLeague);
    }
  }
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ date, sport: sp.sport, leagueId: sp.leagueId, q: sp.q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/matches?${p}`;
  };

  return (
    <>
      <PageHeader eyebrow="Calendario real" title="Partidos">
        Horarios en hora de Colombia. Solo partidos con procedencia verificable de un proveedor de datos.
      </PageHeader>

      <nav aria-label="Rango de fechas" className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.key} href={link({ date: r.key })} aria-current={date === r.key ? 'page' : undefined} className={date === r.key ? 'btn-primary' : 'btn-ghost'}>
            {r.label}
          </Link>
        ))}
      </nav>

      <form className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" action="/matches" role="search">
        <input type="hidden" name="date" value={date} />
        <label className="text-xs text-muted">
          Deporte
          <select name="sport" defaultValue={sp.sport ?? ''} className="input mt-1">
            <option value="">Todos</option>
            {sports.ok && sports.data.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Competición
          <select name="leagueId" defaultValue={sp.leagueId ?? ''} className="input mt-1">
            <option value="">Todas</option>
            {leagues.ok && leagues.data.map((l) => <option key={l.id} value={l.id}>{l.name}{l.country ? ` (${l.country})` : ''}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Buscar equipo
          <input name="q" defaultValue={sp.q ?? ''} className="input mt-1" placeholder="Equipo o liga" />
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full" type="submit">Filtrar</button>
        </div>
      </form>

      <div className="mt-8 space-y-10">
        {!list.ok ? (
          <DataUnavailable error={list.error} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Sin partidos para estos filtros">
            <p>Si esperabas ver partidos, revisa el <Link href="/status" className="underline">estado de los datos</Link>.</p>
          </EmptyState>
        ) : (
          [...groups.entries()].map(([day, byLeague]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-3 font-display text-lg font-bold capitalize">{day}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {[...byLeague.entries()].map(([league, items]) => (
                  <div key={league} className="card p-2">
                    <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">{league}</h3>
                    <ul className="divide-y divide-line">
                      {items.map((f) => <MatchRow key={f.id} f={f} />)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
