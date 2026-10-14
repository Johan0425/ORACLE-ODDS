import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiGet, type SponsorConfig } from '@/lib/api';
import { formatKickoff } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { ChallengeRoom, type ChallengeView } from '@/components/challenges/ChallengeRoom';
import { DataUnavailable } from '@/components/ui/EmptyState';
import { ShareButton } from '@/components/share/ShareButton';
import { SponsorBanner } from '@/components/compliance/SponsorBanner';

export const dynamic = 'force-dynamic';
type Params = Promise<{ code: string }>;

const SYSTEM_LABEL: Record<string, string> = {
  simple: '1 punto por acierto',
  weighted: 'Aciertos ponderados por la cuota de referencia (tope 10)',
  virtual_units: 'Beneficio en unidades virtuales (1 u por selección)',
  survivor: 'Survivor: aciertos consecutivos hasta el primer fallo',
  elimination: 'Eliminación: fuera al segundo fallo',
  quiniela: 'Quiniela: 1 punto por resultado 1X2 acertado',
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params;
  const r = await apiGet<ChallengeView>(`/challenges/${code}`);
  return r.ok ? { title: `Reto: ${r.data.title}`, description: `Únete al reto “${r.data.title}” en ORACLE ODDS. Sin cuenta y sin dinero real.`, robots: { index: false } } : { title: 'Reto' };
}

export default async function ChallengePage({ params }: { params: Params }) {
  const { code } = await params;
  const r = await apiGet<ChallengeView & { sponsorConfig: SponsorConfig | null }>(`/challenges/${code}`, { revalidate: 0 });
  if (!r.ok) {
    if (r.status === 404) notFound();
    return <DataUnavailable error={r.error} />;
  }
  const c = r.data;
  return (
    <>
      <PageHeader eyebrow={`Reto ${c.publicCode} · ${c.status === 'OPEN' ? 'abierto' : c.status === 'LOCKED' ? 'en juego' : 'cerrado'}`} title={c.title} actions={<ShareButton entityType="challenge" entityId={c.publicCode} label="Compartir reto" />}>
        {c.description && <p>{c.description}</p>}
        <p className="mt-1">
          {c.participants}/{c.maxParticipants} participantes · cierra {formatKickoff(c.endsAt)}
        </p>
      </PageHeader>
      <ChallengeRoom initial={c} />
      <section className="card mt-8 p-5 text-sm text-muted" aria-labelledby="rules">
        <h2 id="rules" className="font-semibold text-foreground">Reglas</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Puntuación: {SYSTEM_LABEL[c.scoringRules.system] ?? c.scoringRules.system}.</li>
          <li>Mercados permitidos: {c.scoringRules.allowedMarkets.join(', ')}. Una selección por mercado y partido.</li>
          <li>Las selecciones se bloquean al inicio de cada partido y se liquidan automáticamente con el resultado oficial.</li>
          <li>Desempate: más aciertos y, luego, mayor cuota media acertada.</li>
          <li>{c.disclaimer} No se permiten pagos, depósitos ni premios monetarios.</li>
        </ul>
      </section>
      {c.sponsorConfig && (
        <div className="mt-6">
          <SponsorBanner config={{ ...c.sponsorConfig, placement: 'challenge_sponsor' }} headline="Patrocinador del reto" />
        </div>
      )}
    </>
  );
}
