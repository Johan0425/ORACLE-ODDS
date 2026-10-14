import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, type FixtureDetail, type OddsComparison, type Predictions } from '@/lib/api';
import { sponsorConfig } from '@/lib/server-data';
import { formatKickoff, relativeAge, STATUS_LABEL } from '@/lib/format';
import { SITE_URL } from '@/lib/site';
import { Section } from '@/components/layout/PageHeader';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { LiveDot } from '@/components/ui/Badges';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { OddsComparisonTable } from '@/components/odds/OddsComparisonTable';
import { PredictionsPanel } from '@/components/match/PredictionsPanel';
import { MovementSection } from '@/components/match/MovementSection';
import { ModelExplanation } from '@/components/match/ModelExplanation';
import { FormStrip } from '@/components/match/FormStrip';
import { SponsorBanner } from '@/components/compliance/SponsorBanner';
import { RiskDisclosure } from '@/components/compliance/RiskDisclosure';
import { ShareButton } from '@/components/share/ShareButton';

export const revalidate = 30;
type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const r = await apiGet<FixtureDetail>(`/fixtures/${id}`);
  if (!r.ok) return { title: 'Partido' };
  const f = r.data;
  const title = `${f.homeTeam.name} vs ${f.awayTeam.name}: cuotas y probabilidades`;
  const description = `${f.league.name} · ${formatKickoff(f.kickoff)}. Comparación de cuotas de casas autorizadas y estimación estadística (no es garantía de resultado).`;
  return { title, description, alternates: { canonical: `/matches/${f.id}` }, openGraph: { title, description, url: `${SITE_URL}/matches/${f.id}` } };
}

export default async function MatchPage({ params }: { params: Params }) {
  const { id } = await params;
  const detail = await apiGet<FixtureDetail>(`/fixtures/${id}`);
  if (!detail.ok) {
    if (detail.status === 404) notFound();
    return <DataUnavailable error={detail.error} />;
  }
  const f = detail.data;
  const [preds, oddsRes, stats, sponsorBelow, sponsorAfter] = await Promise.all([
    apiGet<Predictions>(`/fixtures/${id}/predictions`),
    apiGet<OddsComparison>(`/fixtures/${id}/odds`),
    apiGet<Array<{ teamId: string; team: { name: string }; corners: number | null; yellowCards: number | null; redCards: number | null; shotsOnGoal: number | null; shotsTotal: number | null; possession: number | null; expectedGoals: number | null }>>(`/fixtures/${id}/statistics`),
    sponsorConfig('below_comparator'),
    sponsorConfig('post_analysis'),
  ]);

  const probabilities: Record<string, number> = {};
  if (preds.ok) for (const m of preds.data.markets) for (const s of m.selections) probabilities[`${s.marketKey}|${s.line == null ? '' : String(Math.round(s.line * 4) / 4)}|${s.selectionKey}`] = s.calibratedProbability;
  const bestPrices: Record<string, { price: number; bookmaker: string }> = {};
  if (oddsRes.ok) for (const m of oddsRes.data.markets) for (const s of m.selections) if (s.best) bestPrices[`${m.marketKey}|${m.lineKey}|${s.selectionKey}`] = { price: s.best.price, bookmaker: s.best.bookmaker.slug };
  const firstMarket = preds.ok ? preds.data.markets.find((m) => m.selections.length > 0) : undefined;
  const live = f.status === 'LIVE';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
    startDate: f.kickoff,
    eventStatus: f.status === 'POSTPONED' ? 'https://schema.org/EventPostponed' : f.status === 'CANCELLED' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    location: f.venue ? { '@type': 'Place', name: f.venue } : undefined,
    homeTeam: { '@type': 'SportsTeam', name: f.homeTeam.name },
    awayTeam: { '@type': 'SportsTeam', name: f.awayTeam.name },
    superEvent: { '@type': 'SportsEvent', name: f.league.name },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <nav aria-label="Ruta" className="text-xs text-muted">
        <Link href="/matches" className="hover:text-foreground">Partidos</Link> / <span>{f.league.name}</span>
      </nav>

      <header className="card mt-4 p-6">
        <p className="text-center text-xs text-muted">
          {f.league.name}
          {f.round ? ` · ${f.round}` : ''} · <time dateTime={f.kickoff}>{formatKickoff(f.kickoff, { dateStyle: 'full', timeStyle: 'short' })}</time>
          {f.venue ? ` · ${f.venue}` : ''}
        </p>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamLogo name={f.homeTeam.name} src={f.homeTeam.logoUrl} size={56} />
            <h1 className="font-display text-lg font-bold sm:text-2xl">{f.homeTeam.name}</h1>
          </div>
          <div className="text-center">
            {f.homeScore != null && f.status !== 'SCHEDULED' ? (
              <p className="tabular font-display text-4xl font-bold">{f.homeScore} – {f.awayScore}</p>
            ) : (
              <p className="font-display text-2xl text-muted">vs</p>
            )}
            <p className="mt-1 text-xs">{live ? <LiveDot /> : <span className="text-muted">{STATUS_LABEL[f.status]}</span>}</p>
            {live && f.elapsedMinutes != null && <p className="text-sm text-gold-soft">{f.elapsedMinutes}&apos;</p>}
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamLogo name={f.awayTeam.name} src={f.awayTeam.logoUrl} size={56} />
            <h2 className="font-display text-lg font-bold sm:text-2xl">{f.awayTeam.name}</h2>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
          <span>Datos actualizados {relativeAge(f.dataAgeSeconds)}</span>
          <span>{f.lineupsConfirmed ? 'Alineaciones confirmadas' : 'Alineaciones sin confirmar'}</span>
          <ShareButton entityType="fixture" entityId={f.id} label="Compartir análisis" />
        </div>
      </header>

      <nav aria-label="Secciones del partido" className="sticky top-14 z-30 mt-4 -mx-4 overflow-x-auto border-y border-line bg-background/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-full sm:border">
        <ul className="flex gap-4 whitespace-nowrap text-sm">
          {[
            ['#predicciones', 'Predicciones'],
            ['#cuotas', 'Cuotas'],
            ['#movimiento', 'Movimiento'],
            ['#forma', 'Forma y H2H'],
            ['#tabla', 'Tabla'],
            ['#plantillas', 'Lesiones y alineaciones'],
            ['#estadisticas', 'Estadísticas'],
          ].map(([href, label]) => (
            <li key={href}><a href={href} className="text-muted hover:text-gold">{label}</a></li>
          ))}
        </ul>
      </nav>

      <Section title="Predicciones del modelo" id="predicciones">
        {!preds.ok ? (
          <DataUnavailable error={preds.error} />
        ) : !preds.data.available ? (
          <EmptyState title="Predicción no disponible">{preds.data.reason}</EmptyState>
        ) : (
          <div className="space-y-4">
            {preds.data.requireCalibration === false && (
              <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">Entorno con publicación sin calibración habilitada: cifras en validación.</p>
            )}
            <PredictionsPanel fixture={f} predictions={preds.data} bestPrices={bestPrices} />
            {preds.data.run && <ModelExplanation run={preds.data.run} factors={firstMarket?.selections[0]?.factors ?? []} reductions={firstMarket?.selections[0]?.confidenceReductions ?? []} />}
          </div>
        )}
      </Section>

      <Section title="Comparador de cuotas" id="cuotas">
        {!oddsRes.ok ? (
          <DataUnavailable error={oddsRes.error} />
        ) : oddsRes.data.markets.length === 0 ? (
          <EmptyState title="Sin cuotas de casas autorizadas para este partido" />
        ) : (
          <ErrorBoundary>
            <OddsComparisonTable data={oddsRes.data} fixture={{ id: f.id, home: f.homeTeam.name, away: f.awayTeam.name, kickoff: f.kickoff }} probabilities={probabilities} />
          </ErrorBoundary>
        )}
        <div className="mt-4">
          <SponsorBanner config={sponsorBelow} />
        </div>
      </Section>

      <Section title="Movimiento del mercado" id="movimiento">
        {oddsRes.ok && oddsRes.data.markets.length > 0 ? (
          <ErrorBoundary>
            <MovementSection fixtureId={f.id} markets={oddsRes.data.markets} home={f.homeTeam.name} away={f.awayTeam.name} />
          </ErrorBoundary>
        ) : (
          <p className="text-sm text-muted">Sin historial de cuotas.</p>
        )}
      </Section>

      <Section title="Forma reciente y H2H" id="forma">
        <div className="grid gap-4 md:grid-cols-2">
          {([['home', f.homeTeam.name], ['away', f.awayTeam.name]] as const).map(([side, name]) => (
            <div key={side} className="card p-4">
              <h3 className="mb-3 text-sm font-semibold">{name}</h3>
              <FormStrip items={f.form[side]} />
            </div>
          ))}
        </div>
        <div className="card mt-4 p-4">
          <h3 className="mb-2 text-sm font-semibold">Enfrentamientos directos</h3>
          {f.h2h.length === 0 ? (
            <p className="text-sm text-muted">Sin enfrentamientos previos registrados.</p>
          ) : (
            <ul className="tabular divide-y divide-line text-sm">
              {f.h2h.map((m) => (
                <li key={m.fixtureId} className="flex justify-between gap-2 py-2">
                  <span className="text-muted">{formatKickoff(m.kickoff, { dateStyle: 'medium' })} · {m.league}</span>
                  <span>{m.homeTeam} <strong>{m.homeScore}–{m.awayScore}</strong> {m.awayTeam}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">El H2H tiene peso bajo y decaimiento temporal en el modelo.</p>
        </div>
      </Section>

      <Section title="Clasificación" id="tabla">
        {f.standings.length === 0 ? (
          <p className="text-sm text-muted">Clasificación no disponible para esta competición.</p>
        ) : (
          <div className="card overflow-x-auto p-2">
            <table className="tabular w-full min-w-[520px] text-sm">
              <caption className="sr-only">Clasificación de {f.league.name}</caption>
              <thead className="text-xs text-muted">
                <tr>{['#', 'Equipo', 'PJ', 'G', 'E', 'P', 'GF', 'GC', 'Pts'].map((h) => <th key={h} scope="col" className="px-2 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {f.standings.map((s) => {
                  const mine = s.team.id === f.homeTeam.id || s.team.id === f.awayTeam.id;
                  return (
                    <tr key={s.team.id + s.groupName} className={`border-t border-line ${mine ? 'bg-gold/10' : ''}`}>
                      <td className="px-2 py-1.5">{s.rank}</td>
                      <th scope="row" className="px-2 py-1.5 text-left font-medium">{s.team.name}</th>
                      <td className="px-2">{s.played}</td><td className="px-2">{s.won}</td><td className="px-2">{s.drawn}</td><td className="px-2">{s.lost}</td>
                      <td className="px-2">{s.goalsFor}</td><td className="px-2">{s.goalsAgainst}</td><td className="px-2 font-bold">{s.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Lesiones y alineaciones" id="plantillas">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Ausencias reportadas</h3>
            {f.injuries.length === 0 ? (
              <p className="text-sm text-muted">El proveedor no reporta ausencias para este partido.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {f.injuries.map((i) => (
                  <li key={i.id}><strong>{i.player.name}</strong> <span className="text-muted">({i.team?.name}) · {i.status === 'out' ? 'baja' : 'duda'}{i.reason ? ` · ${i.reason}` : ''}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Alineaciones</h3>
            {f.lineups.length === 0 ? (
              <p className="text-sm text-muted">Aún no confirmadas (normalmente ~1 hora antes del inicio).</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {f.lineups.map((l) => (
                  <div key={l.teamId}>
                    <p className="text-xs font-semibold text-muted">{l.team.name} {l.formation ? `· ${l.formation}` : ''}</p>
                    <ol className="mt-1 space-y-0.5 text-sm">
                      {l.startXI.map((p) => <li key={p.name}><span className="tabular text-muted">{p.number ?? '–'}</span> {p.name}</li>)}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Estadísticas del partido" id="estadisticas">
        {!stats.ok || stats.data.length < 2 ? (
          <p className="text-sm text-muted">Estadísticas disponibles cuando el proveedor las publique.</p>
        ) : (
          <dl className="card tabular grid gap-2 p-4 text-sm">
            {([['Posesión', 'possession', '%'], ['Tiros', 'shotsTotal', ''], ['Tiros a puerta', 'shotsOnGoal', ''], ['Córners', 'corners', ''], ['Amarillas', 'yellowCards', ''], ['Rojas', 'redCards', ''], ['xG (proveedor)', 'expectedGoals', '']] as const).map(([label, key, suffix]) => {
              const h = stats.data.find((s) => s.teamId === f.homeTeam.id)?.[key];
              const a = stats.data.find((s) => s.teamId === f.awayTeam.id)?.[key];
              if (h == null && a == null) return null;
              return (
                <div key={key} className="grid grid-cols-[1fr_auto_1fr] gap-3">
                  <dd className="text-right font-semibold">{h ?? '—'}{suffix}</dd>
                  <dt className="text-center text-muted">{label}</dt>
                  <dd className="font-semibold">{a ?? '—'}{suffix}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </Section>

      <div className="mt-10 space-y-4">
        <SponsorBanner config={sponsorAfter} />
        <RiskDisclosure />
      </div>
    </>
  );
}
