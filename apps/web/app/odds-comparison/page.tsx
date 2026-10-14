import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, type FixtureList, type OddsComparison } from '@/lib/api';
import { sponsorConfig } from '@/lib/server-data';
import { formatKickoff } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { OddsComparisonTable } from '@/components/odds/OddsComparisonTable';
import { SponsorBanner } from '@/components/compliance/SponsorBanner';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Comparador de cuotas', description: 'Compara cuotas de casas autorizadas por mercado, con apertura, movimiento y frescura.' };
export const revalidate = 30;

export default async function OddsComparisonPage({ searchParams }: { searchParams: Promise<{ fixture?: string }> }) {
  const sp = await searchParams;
  const list = await apiGet<FixtureList>('/fixtures?date=week&status=SCHEDULED&limit=100');
  const withOdds = list.ok ? list.data.items.filter((f) => (f._count?.oddsQuotes ?? 0) > 0) : [];
  const selected = withOdds.find((f) => f.id === sp.fixture) ?? withOdds[0];
  const [odds, sponsor] = await Promise.all([selected ? apiGet<OddsComparison>(`/fixtures/${selected.id}/odds`) : Promise.resolve(null), sponsorConfig('below_comparator')]);

  return (
    <>
      <PageHeader eyebrow="Comparador" title="Comparador de cuotas">
        Solo casas autorizadas y activas. Cuotas vencidas ocultas por defecto. Los enlaces comerciales están marcados como afiliados.
      </PageHeader>
      {!list.ok ? (
        <DataUnavailable error={list.error} />
      ) : withOdds.length === 0 ? (
        <EmptyState title="No hay cuotas sincronizadas para los próximos 7 días" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <nav aria-label="Partidos con cuotas" className="card max-h-[70vh] overflow-y-auto p-2">
            <ul>
              {withOdds.map((f) => (
                <li key={f.id}>
                  <Link href={`/odds-comparison?fixture=${f.id}`} aria-current={selected?.id === f.id ? 'page' : undefined} className={`block rounded-lg px-3 py-2 text-sm ${selected?.id === f.id ? 'bg-gold/10 text-gold-soft' : 'hover:bg-surface-2'}`}>
                    <span className="block truncate">{f.homeTeam.name} vs {f.awayTeam.name}</span>
                    <span className="text-xs text-muted">{f.league.name} · {formatKickoff(f.kickoff, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <section className="card p-4" aria-label="Cuotas del partido">
            {selected && (
              <h2 className="mb-4 font-display text-xl font-bold">
                <Link href={`/matches/${selected.id}`} className="hover:text-gold-soft">{selected.homeTeam.name} vs {selected.awayTeam.name}</Link>
              </h2>
            )}
            {odds && odds.ok && selected ? (
              <OddsComparisonTable data={odds.data} fixture={{ id: selected.id, home: selected.homeTeam.name, away: selected.awayTeam.name, kickoff: selected.kickoff }} />
            ) : (
              <DataUnavailable error={odds && !odds.ok ? odds.error : undefined} />
            )}
          </section>
        </div>
      )}
      <div className="mt-6"><SponsorBanner config={sponsor} /></div>
    </>
  );
}
