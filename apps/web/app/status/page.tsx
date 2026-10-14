import type { Metadata } from 'next';
import { dataStatus } from '@/lib/server-data';
import { formatKickoff, relativeAge } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataUnavailable } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Estado de los datos', description: 'Frescura de cada fuente de datos y última sincronización exitosa.' };
export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const s = await dataStatus();
  if (!s) return <DataUnavailable error="No se pudo consultar el estado de la API" />;
  return (
    <>
      <PageHeader eyebrow="Transparencia" title="Estado de los datos">{s.message}</PageHeader>
      <dl className="tabular grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Partidos próximos', s.counts.upcomingFixtures],
          ['En vivo', s.counts.liveFixtures],
          ['Cuotas autorizadas', s.counts.authorizedQuotes],
          ['Oportunidades activas', s.counts.activeValueBets],
        ].map(([k, v]) => (
          <div key={k} className="card p-4"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 font-display text-2xl font-bold">{v}</dd></div>
        ))}
      </dl>
      <h2 className="mt-10 font-display text-xl font-bold">Proveedores</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {s.providers.map((p) => (
          <li key={p.provider} className="card p-4 text-sm">
            <p className="flex items-center justify-between font-semibold">{p.provider}<span className={p.configured ? 'text-positive' : 'text-muted'}>{p.configured ? 'Configurado' : 'Sin configurar'}</span></p>
            <p className="mt-1 text-xs text-muted">{p.roles.join(' · ')}</p>
            {p.quota && <p className="mt-1 text-xs text-muted">Cupo hoy: {p.quota.usedToday}/{p.quota.dailyLimit}{p.quota.reportedRemaining != null ? ` · restante informado ${p.quota.reportedRemaining}` : ''}</p>}
          </li>
        ))}
      </ul>
      <h2 className="mt-10 font-display text-xl font-bold">Sincronizaciones</h2>
      {s.jobs.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Todavía no se ha ejecutado ninguna sincronización.</p>
      ) : (
        <div className="card mt-3 overflow-x-auto p-2">
          <table className="tabular w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{['Fuente', 'Proceso', 'Último éxito', 'Estado', 'Fallos seguidos'].map((h) => <th key={h} className="px-2 py-2" scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {s.jobs.map((j) => (
                <tr key={j.provider + j.job} className="border-t border-line">
                  <td className="px-2 py-2">{j.provider}</td>
                  <td className="px-2">{j.job}</td>
                  <td className="px-2">{j.lastSuccessfulSync ? `${formatKickoff(j.lastSuccessfulSync)} (${relativeAge(j.ageSeconds)})` : 'Nunca'}</td>
                  <td className={`px-2 ${j.stale ? 'text-warning' : 'text-positive'}`}>{j.stale ? 'Vencido' : 'Al día'}{j.lastError ? <span className="block text-xs text-muted">{j.lastError}</span> : null}</td>
                  <td className="px-2">{j.consecutiveFailures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Generado {formatKickoff(s.generatedAt)} · zona horaria {s.timezone} · casas autorizadas configuradas: {s.authorizedBookmakersConfigured}</p>
    </>
  );
}
