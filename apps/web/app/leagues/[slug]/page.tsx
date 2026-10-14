import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiGet, type FixtureList, type League } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { MatchRow } from '@/components/match/MatchRow';
import { EmptyState } from '@/components/ui/EmptyState';

export const revalidate = 300;
type Params = Promise<{ slug: string }>;

async function findLeague(slug: string) {
  const r = await apiGet<League[]>('/leagues', { revalidate: 600 });
  return r.ok ? (r.data.find((l) => l.slug === slug) ?? null) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const l = await findLeague((await params).slug);
  return l ? { title: `${l.name}: cuotas y probabilidades`, description: `Próximos partidos de ${l.name}${l.country ? ` (${l.country})` : ''} con comparación de cuotas y estimaciones estadísticas.`, alternates: { canonical: `/leagues/${l.slug}` } } : { title: 'Competición' };
}

export default async function LeaguePage({ params }: { params: Params }) {
  const league = await findLeague((await params).slug);
  if (!league) notFound();
  const list = await apiGet<FixtureList>(`/fixtures?leagueId=${league.id}&date=week&limit=100`);
  return (
    <>
      <PageHeader eyebrow={league.country ?? league.sport.name} title={league.name}>Partidos de los próximos 7 días.</PageHeader>
      {list.ok && list.data.items.length > 0 ? (
        <ul className="card divide-y divide-line p-2">{list.data.items.map((f) => <MatchRow key={f.id} f={f} />)}</ul>
      ) : (
        <EmptyState title="Sin partidos próximos sincronizados" />
      )}
    </>
  );
}
