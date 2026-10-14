import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isMarketKey, MARKET_DEFINITIONS } from '@oracle-odds/probability-engine';
import { apiGet, type ValueBetList } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValueBetCard } from '@/components/odds/ValueBetCard';
import { EmptyState } from '@/components/ui/EmptyState';

export const revalidate = 120;
type Params = Promise<{ key: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { key } = await params;
  return isMarketKey(key) ? { title: `${MARKET_DEFINITIONS[key].displayName}: oportunidades de valor`, alternates: { canonical: `/markets/${key}` } } : { title: 'Mercado' };
}

export default async function MarketPage({ params }: { params: Params }) {
  const { key } = await params;
  if (!isMarketKey(key)) notFound();
  const list = await apiGet<ValueBetList>(`/value-bets?market=${key}&limit=30`);
  return (
    <>
      <PageHeader eyebrow="Mercado" title={MARKET_DEFINITIONS[key].displayName}>Oportunidades activas en este mercado, ordenadas por calidad.</PageHeader>
      {list.ok && list.data.items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.data.items.map((vb) => <ValueBetCard key={vb.id} vb={vb} />)}</div>
      ) : (
        <EmptyState title="Sin oportunidades activas en este mercado" />
      )}
    </>
  );
}
