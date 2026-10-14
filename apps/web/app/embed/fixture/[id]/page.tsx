import type { Metadata } from 'next';
import { apiGet, type FixtureDetail, type OddsComparison } from '@/lib/api';
import { formatKickoff, odds, selectionName } from '@/lib/format';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = { robots: { index: false } };
export const revalidate = 60;

/** Widget embebible para medios: mejores cuotas 1X2 + avisos obligatorios. Uso: <iframe src="/embed/fixture/ID">. */
export default async function EmbedFixture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [f, o] = await Promise.all([apiGet<FixtureDetail>(`/fixtures/${id}`), apiGet<OddsComparison>(`/fixtures/${id}/odds`)]);
  if (!f.ok) return <p className="p-4 text-sm text-muted">Partido no disponible.</p>;
  const m = o.ok ? o.data.markets.find((x) => x.marketKey === '1X2') : undefined;
  return (
    <div className="card m-2 p-4 text-sm">
      <p className="text-xs text-muted">{f.data.league.name} · {formatKickoff(f.data.kickoff)}</p>
      <p className="mt-1 font-semibold">{f.data.homeTeam.name} vs {f.data.awayTeam.name}</p>
      {m ? (
        <ul className="tabular mt-3 grid grid-cols-3 gap-2 text-center">
          {m.selections.map((s) => (
            <li key={s.selectionKey} className="rounded-lg bg-surface-2 p-2">
              <span className="block text-xs text-muted">{selectionName('1X2', s.selectionKey, null, f.data.homeTeam.name, f.data.awayTeam.name)}</span>
              <strong className="text-gold-soft">{odds(s.best?.price)}</strong>
              <span className="block text-[10px] text-muted">{s.best?.bookmaker.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted">Sin cuotas disponibles.</p>
      )}
      <p className="mt-3 text-[10px] text-muted">18+ · Cuotas sujetas a cambios · Información estadística, no garantía. <a href={`${SITE_URL}/matches/${id}`} target="_blank" rel="noopener" className="underline">ORACLE ODDS</a></p>
    </div>
  );
}
