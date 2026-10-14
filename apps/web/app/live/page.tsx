import type { Metadata } from 'next';
import { apiGet, type LiveFixture } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { LiveBoard } from '@/components/match/LiveBoard';

export const metadata: Metadata = { title: 'En vivo', description: 'Marcadores, eventos y cuotas en vivo con latencia indicada.' };
export const dynamic = 'force-dynamic';

export default async function LivePage() {
  const initial = await apiGet<LiveFixture[]>('/fixtures/live', { revalidate: 0 });
  return (
    <>
      <PageHeader eyebrow="En vivo" title="Partidos en curso">
        Las actualizaciones llegan por streaming (SSE) desde nuestra API, que a su vez consulta al proveedor periódicamente. Mostramos la antigüedad de cada dato: si el proveedor tiene retraso, no lo presentamos como tiempo real. No publicamos oportunidades en vivo con cuotas vencidas, mercados suspendidos o latencia excesiva.
      </PageHeader>
      <LiveBoard initial={initial.ok ? initial.data : []} initialError={initial.ok ? null : initial.error} />
    </>
  );
}
