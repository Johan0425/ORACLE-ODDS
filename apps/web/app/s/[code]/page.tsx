/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, type ShareAsset } from '@/lib/api';
import { shareLines } from '@/lib/share-render';
import { RiskDisclosure } from '@/components/compliance/RiskDisclosure';
import { SITE_URL } from '@/lib/site';

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params;
  const r = await apiGet<ShareAsset>(`/share/${code}`);
  if (!r.ok) return { title: 'Enlace no disponible' };
  const l = shareLines(r.data);
  const image = `${SITE_URL}/s/${r.data.publicCode}/image?format=landscape`;
  return {
    title: l.title,
    description: `${l.subtitle}. Pronóstico estadístico, no garantía de resultado. 18+.`,
    robots: { index: false },
    openGraph: { title: l.title, description: l.subtitle, images: [{ url: image, width: 1200, height: 628 }] },
    twitter: { card: 'summary_large_image', images: [image] },
  };
}

export default async function SharedPage({ params }: { params: Params }) {
  const { code } = await params;
  const r = await apiGet<ShareAsset>(`/share/${code}`);
  if (!r.ok) notFound();
  const a = r.data;
  const target = a.entityType === 'fixture' ? `/matches/${a.entityId}` : a.entityType === 'challenge' ? `/challenge/${a.entityId}` : a.entityType === 'value_bet' ? '/best-bets' : '/builder';
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <img src={`/s/${a.publicCode}/image?format=square`} alt={shareLines(a).title} className="w-full rounded-2xl border border-line" />
      <pre className="card whitespace-pre-wrap p-4 text-sm text-muted">{a.shareText}</pre>
      <div className="flex flex-wrap gap-2">
        <Link href={target} className="btn-primary">Ver análisis actualizado</Link>
        <Link href="/methodology" className="btn-ghost">Metodología</Link>
      </div>
      <p className="text-xs text-muted">Pieza generada el {new Date(a.payload.generatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}. Las cuotas mostradas pueden haber cambiado.</p>
      <RiskDisclosure compact />
    </div>
  );
}
