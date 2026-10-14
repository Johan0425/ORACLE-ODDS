import Link from 'next/link';
import { apiGet, type FixtureList, type LiveFixture, type TrackRecord, type ValueBetList } from '@/lib/api';
import { dataStatus, sponsorConfig } from '@/lib/server-data';
import { pct, units } from '@/lib/format';
import { COMPLIANCE } from '@/lib/compliance';
import { Section } from '@/components/layout/PageHeader';
import { DataStatusIndicator } from '@/components/compliance/DataStatusIndicator';
import { SponsorBanner } from '@/components/compliance/SponsorBanner';
import { ResponsibleGamingBanner } from '@/components/compliance/ResponsibleGamingBanner';
import { ValueBetCard } from '@/components/odds/ValueBetCard';
import { LiveMatchCard } from '@/components/match/LiveMatchCard';
import { MatchRow } from '@/components/match/MatchRow';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';

export const revalidate = 30;

const STEPS = [
  { title: 'Datos reales', text: 'Sincronizamos partidos, resultados y cuotas de proveedores con licencia de datos. Sin datos inventados: si una fuente falla, lo decimos.' },
  { title: 'Modelo calibrado', text: 'Un ensemble estadístico (Dixon-Coles, Elo y consenso de mercado sin margen) estima probabilidades y su incertidumbre, evaluado fuera de muestra.' },
  { title: 'Valor, no favoritos', text: 'Comparamos la probabilidad con la mejor cuota autorizada. Una selección del 80% puede no tener valor si la cuota no compensa el riesgo.' },
];

export default async function HomePage() {
  const [status, live, vbs, today, track, sponsor] = await Promise.all([
    dataStatus(),
    apiGet<LiveFixture[]>('/fixtures/live', { revalidate: 15 }),
    apiGet<ValueBetList>('/value-bets?limit=3', { revalidate: 60 }),
    apiGet<FixtureList>('/fixtures?date=today&limit=12', { revalidate: 60 }),
    apiGet<TrackRecord>('/track-record?limit=1', { revalidate: 300 }),
    sponsorConfig('hero_secondary'),
  ]);

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-surface via-background to-surface px-6 py-12 sm:px-10 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
        <p className="eyebrow">Inteligencia de cuotas</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">
          Compara cuotas reales y descubre dónde el precio no refleja la probabilidad.
        </h1>
        <p className="mt-4 max-w-2xl text-muted">{COMPLIANCE.disclaimer} No recibimos apuestas ni custodiamos dinero.</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/best-bets" className="btn-primary">Ver mejores oportunidades</Link>
          <Link href="/matches" className="btn-ghost">Calendario</Link>
          <DataStatusIndicator status={status} />
        </div>
      </section>

      <div className="mt-6">
        <SponsorBanner config={sponsor} variant="inline" />
      </div>

      {status?.overall === 'NOT_CONFIGURED' && (
        <div className="mt-8">
          <EmptyState title="Fuentes de datos pendientes de configurar" tone="warning">
            <p>{status.message} Consulta el <Link className="underline" href="/status">estado de los datos</Link>.</p>
          </EmptyState>
        </div>
      )}

      {live.ok && live.data.length > 0 && (
        <Section title="En vivo ahora" id="live" action={<Link href="/live" className="text-sm text-gold hover:underline">Ver todos</Link>}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {live.data.slice(0, 3).map((f) => (
              <LiveMatchCard key={f.id} f={f} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Mejores oportunidades" id="best" action={<Link href="/best-bets" className="text-sm text-gold hover:underline">Ver todas</Link>}>
        {!vbs.ok ? (
          <DataUnavailable error={vbs.error} />
        ) : vbs.data.items.length === 0 ? (
          <EmptyState title="Sin oportunidades que superen los umbrales ahora mismo">
            <p>Solo publicamos selecciones con edge, valor esperado, calidad y frescura suficientes en mercados validados. Es normal que haya días sin ninguna.</p>
          </EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {vbs.data.items.map((vb) => (
              <ValueBetCard key={vb.id} vb={vb} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Partidos de hoy" id="today" action={<Link href="/matches" className="text-sm text-gold hover:underline">Calendario completo</Link>}>
        {!today.ok ? (
          <DataUnavailable error={today.error} />
        ) : today.data.items.length === 0 ? (
          <EmptyState title="No hay partidos sincronizados para hoy" />
        ) : (
          <ul className="card divide-y divide-line p-2">
            {today.data.items.map((f) => (
              <MatchRow key={f.id} f={f} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Cómo funciona" id="how">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <span className="font-display text-3xl font-bold text-gold/60">0{i + 1}</span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm">
          <Link href="/methodology" className="text-gold hover:underline">Leer la metodología completa →</Link>
        </p>
      </Section>

      <Section title="Rendimiento histórico" id="track" action={<Link href="/track-record" className="text-sm text-gold hover:underline">Historial auditable</Link>}>
        {!track.ok ? (
          <DataUnavailable error={track.error} />
        ) : track.data.summary.bets === 0 ? (
          <EmptyState title="Aún no hay oportunidades liquidadas">
            <p>El historial se construye con cada oportunidad publicada, incluidas las perdidas. Nunca se elimina ninguna.</p>
          </EmptyState>
        ) : (
          <dl className="tabular grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Liquidadas', String(track.data.summary.bets)],
              ['ROI (1 u plana)', pct(track.data.summary.roi)],
              ['Beneficio', units(track.data.summary.profit)],
              ['CLV medio', pct(track.data.summary.avgClv)],
            ].map(([k, v]) => (
              <div key={k} className="card p-4">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-1 font-display text-2xl font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <div className="mt-12">
        <ResponsibleGamingBanner variant="card" />
      </div>
    </>
  );
}
