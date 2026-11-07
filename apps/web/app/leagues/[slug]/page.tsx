import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, type FixtureList, type League } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { MatchRow } from '@/components/match/MatchRow';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';

export const revalidate = 300;
type Params = Promise<{ slug: string }>;

interface StandingRow {
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  groupName: string;
  team: { id: string; name: string; logoUrl: string | null };
}

async function findLeague(slug: string) {
  const r = await apiGet<League[]>('/leagues', { revalidate: 600 });
  return r.ok ? (r.data.find((l) => l.slug === slug) ?? null) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const l = await findLeague((await params).slug);
  return l
    ? { title: `${l.name}: pronósticos, resultados y tabla`, description: `Partidos, resultados, clasificación y pronósticos estadísticos de ${l.name}${l.country ? ` (${l.country})` : ''}.`, alternates: { canonical: `/leagues/${l.slug}` } }
    : { title: 'Competición' };
}

function ByDay({ items }: { items: FixtureList['items'] }) {
  const days = new Map<string, FixtureList['items']>();
  for (const f of items) days.set(formatDay(f.kickoff), [...(days.get(formatDay(f.kickoff)) ?? []), f]);
  return (
    <div className="grid gap-4">
      {[...days.entries()].map(([day, list]) => (
        <div key={day} className="card p-2">
          <h3 className="px-3 pt-2 text-xs font-semibold capitalize text-muted">{day}</h3>
          <ul className="divide-y divide-line">{list.map((f) => <MatchRow key={f.id} f={f} />)}</ul>
        </div>
      ))}
    </div>
  );
}

export default async function LeaguePage({ params }: { params: Params }) {
  const league = await findLeague((await params).slug);
  if (!league) notFound();
  const [recent, upcoming, table] = await Promise.all([
    apiGet<FixtureList>(`/fixtures?leagueId=${league.id}&date=last14&limit=100`),
    apiGet<FixtureList>(`/fixtures?leagueId=${league.id}&date=next30&limit=100`),
    apiGet<StandingRow[]>(`/leagues/${league.id}/standings`, { revalidate: 600 }),
  ]);
  const recentItems = recent.ok ? [...recent.data.items].reverse() : [];
  const groups = table.ok ? [...new Set(table.data.map((r) => r.groupName))] : [];
  return (
    <>
      <PageHeader eyebrow={league.country ?? league.sport.name} title={league.name}>
        Temporada {league.season || 'vigente'}.{' '}
        <Link href={`/pronosticos?liga=${league.id}`} className="text-gold hover:underline">Ver pronósticos de la semana →</Link>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <Section title="Próximos partidos (30 días)" id="proximos">
            {upcoming.ok && upcoming.data.items.length > 0 ? <ByDay items={upcoming.data.items} /> : <EmptyState title="Sin partidos programados en los próximos 30 días" />}
          </Section>
          <Section title="Resultados recientes (14 días)" id="resultados">
            {recentItems.length > 0 ? <ByDay items={recentItems} /> : <EmptyState title="Sin partidos jugados en los últimos 14 días" />}
          </Section>
        </div>
        <Section title="Clasificación" id="tabla">
          {table.ok && table.data.length > 0 ? (
            groups.map((g) => (
              <div key={g || 'general'} className="card mb-4 overflow-x-auto p-2">
                {g && <h3 className="px-2 pt-1 text-xs font-semibold text-muted">{g}</h3>}
                <table className="tabular w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Equipo</th><th className="p-2">PJ</th><th className="p-2">DG</th><th className="p-2">Pts</th></tr>
                  </thead>
                  <tbody>
                    {table.data.filter((r) => r.groupName === g).map((r) => (
                      <tr key={r.team.id} className="border-t border-line">
                        <td className="p-2 text-muted">{r.rank}</td>
                        <td className="p-2"><span className="flex items-center gap-2"><TeamLogo name={r.team.name} src={r.team.logoUrl} size={18} /><span className="truncate">{r.team.name}</span></span></td>
                        <td className="p-2 text-center">{r.played}</td>
                        <td className="p-2 text-center">{r.goalsFor - r.goalsAgainst > 0 ? '+' : ''}{r.goalsFor - r.goalsAgainst}</td>
                        <td className="p-2 text-center font-bold">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            <EmptyState title="Clasificación no disponible" />
          )}
        </Section>
      </div>
    </>
  );
}
