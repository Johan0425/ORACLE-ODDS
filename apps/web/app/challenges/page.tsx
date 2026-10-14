import type { Metadata } from 'next';
import { apiGet, type FixtureList } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { ChallengeBuilder } from '@/components/challenges/ChallengeBuilder';
import { DataUnavailable } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Retos sociales', description: 'Crea retos de pronósticos entre amigos, sin cuenta y sin dinero real.' };
export const dynamic = 'force-dynamic';

export default async function ChallengesPage() {
  const list = await apiGet<FixtureList>('/fixtures?date=week&status=SCHEDULED&limit=100', { revalidate: 0 });
  return (
    <>
      <PageHeader eyebrow="Sin cuenta · sin dinero real" title="Retos sociales">
        Crea un reto, comparte el código y compite con tus amigos acertando resultados de partidos reales. Puntuación automática y clasificación pública con alias.
      </PageHeader>
      {list.ok ? <ChallengeBuilder fixtures={list.data.items} /> : <DataUnavailable error={list.error} />}
    </>
  );
}
