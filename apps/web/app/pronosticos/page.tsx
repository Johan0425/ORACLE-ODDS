import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, type PickSelection, type WeekPick, type WeekPicks } from '@/lib/api';
import { formatDay, formatKickoff, formatTime, odds as fmtOdds, pct, STATUS_LABEL } from '@/lib/format';
import { SITE_URL } from '@/lib/site';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { LiveDot } from '@/components/ui/Badges';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';
import { SharePicks } from '@/components/share/SharePicks';

export const metadata: Metadata = {
  title: 'Pronósticos por semana',
  description: 'Pronósticos estadísticos de la semana pasada, la actual y las siguientes, por liga, con los aciertos de los partidos ya jugados.',
  alternates: { canonical: '/pronosticos' },
};
export const revalidate = 120;

const WEEKS = [
  { offset: -2, label: 'Hace 2 semanas' },
  { offset: -1, label: 'Semana pasada' },
  { offset: 0, label: 'Esta semana' },
  { offset: 1, label: 'Próxima semana' },
  { offset: 2, label: 'En 2 semanas' },
  { offset: 3, label: 'En 3 semanas' },
];

const MARKET_LABEL: Record<string, string> = { '1X2': 'Resultado (1X2)', OU_GOALS: 'Más/Menos 2.5 goles', BTTS: 'Ambos marcan' };

function pickLabel(p: PickSelection, home: string, away: string): string {
  if (p.marketKey === '1X2') return p.selectionKey === 'HOME' ? `Gana ${home}` : p.selectionKey === 'AWAY' ? `Gana ${away}` : 'Empate';
  if (p.marketKey === 'OU_GOALS') return `${p.selectionKey === 'OVER' ? 'Más' : 'Menos'} de ${p.line ?? 2.5} goles`;
  return p.selectionKey === 'YES' ? 'Ambos marcan' : 'No marcan ambos';
}

const ratio = (won: number, settled: number) => (settled ? `${won}/${settled} (${Math.round((won / settled) * 100)}%)` : '—');

function ResultMark({ r }: { r: PickSelection['result'] }) {
  if (r === 'WON') return <span className="text-positive" aria-label="Acertado">✓</span>;
  if (r === 'LOST') return <span className="text-negative" aria-label="Fallado">✗</span>;
  return null;
}

function ProbBar({ m }: { m: WeekPick }) {
  const p = m.prediction?.oneXTwo;
  if (!p?.HOME || !p.DRAW || !p.AWAY) return null;
  const parts = [
    { k: 'HOME', v: p.HOME, label: '1', cls: 'bg-gold' },
    { k: 'DRAW', v: p.DRAW, label: 'X', cls: 'bg-muted/60' },
    { k: 'AWAY', v: p.AWAY, label: '2', cls: 'bg-info' },
  ];
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full" role="img" aria-label={`Probabilidades: local ${pct(p.HOME, 0)}, empate ${pct(p.DRAW, 0)}, visitante ${pct(p.AWAY, 0)}`}>
        {parts.map((x) => <span key={x.k} className={x.cls} style={{ width: `${x.v * 100}%` }} />)}
      </div>
      <div className="tabular mt-1 flex justify-between text-[11px] text-muted">
        {parts.map((x) => <span key={x.k}>{x.label} {pct(x.v, 0)}</span>)}
      </div>
    </div>
  );
}

function MatchCard({ m }: { m: WeekPick }) {
  const live = m.status === 'LIVE';
  const showScore = m.homeScore != null && m.awayScore != null && m.status !== 'SCHEDULED';
  return (
    <li className="rounded-xl border border-line bg-surface-2/40 p-3" data-testid="pick-card">
      <Link href={`/matches/${m.id}`} className="grid grid-cols-[52px_1fr_auto] items-center gap-3">
        <span className="tabular text-xs text-muted">
          {live ? <LiveDot /> : m.status === 'SCHEDULED' ? <time dateTime={m.kickoff}>{formatTime(m.kickoff)}</time> : STATUS_LABEL[m.status]}
        </span>
        <span className="grid min-w-0 gap-1 text-sm">
          <span className="flex items-center gap-2"><TeamLogo name={m.homeTeam.name} src={m.homeTeam.logoUrl} size={18} /><span className="truncate">{m.homeTeam.name}</span></span>
          <span className="flex items-center gap-2"><TeamLogo name={m.awayTeam.name} src={m.awayTeam.logoUrl} size={18} /><span className="truncate">{m.awayTeam.name}</span></span>
        </span>
        {showScore ? (
          <span className="tabular grid gap-1 text-right font-bold"><span>{m.homeScore}</span><span>{m.awayScore}</span></span>
        ) : (
          <span className="text-[11px] text-muted">{live && m.elapsedMinutes != null ? `${m.elapsedMinutes}'` : ''}</span>
        )}
      </Link>
      {m.prediction ? (
        <>
          <ProbBar m={m} />
          <ul className="mt-3 flex flex-wrap gap-2">
            {m.picks.map((p) => (
              <li
                key={p.marketKey}
                className={`chip ${m.featured?.marketKey === p.marketKey ? 'border-gold/60 text-gold-soft' : ''}`}
                title={`${MARKET_LABEL[p.marketKey]} · cuota justa ${fmtOdds(p.fairOdds)}${p.marketPrice ? ` · mercado ${fmtOdds(p.marketPrice)} (${p.marketBookmaker}, referencia)` : ''}`}
              >
                {m.featured?.marketKey === p.marketKey && <span aria-hidden>★</span>}
                {pickLabel(p, m.homeTeam.shortName || m.homeTeam.name, m.awayTeam.shortName || m.awayTeam.name)}
                <span className="tabular text-foreground">{pct(p.probability, 0)}</span>
                {p.marketPrice ? <span className="tabular text-muted">@{fmtOdds(p.marketPrice)}</span> : null}
                <ResultMark r={p.result} />
              </li>
            ))}
          </ul>
          <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted">
            {m.prediction.expectedGoals.home != null && m.prediction.expectedGoals.away != null && (
              <span className="tabular">Goles esperados {m.prediction.expectedGoals.home.toFixed(1)} – {m.prediction.expectedGoals.away.toFixed(1)}</span>
            )}
            {m.prediction.source === 'backtest' && <span title="Predicción reconstruida sin datos posteriores al inicio (evaluación walk-forward)">Evaluación retrospectiva</span>}
            {m.hasAnalysis && <Link href={`/matches/${m.id}#analisis`} className="text-gold hover:underline">Análisis IA</Link>}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-muted">Sin pronóstico: historial insuficiente de alguno de los equipos o cálculo pendiente.</p>
      )}
    </li>
  );
}

function shareText(d: WeekPicks, week: string, leagueName: string | null): string {
  const upcoming = d.items.filter((i) => i.featured && i.status === 'SCHEDULED').slice(0, 12);
  const finished = d.items.filter((i) => i.featured?.result);
  const lines = upcoming.map((i) => `• ${formatKickoff(i.kickoff, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${i.homeTeam.name} vs ${i.awayTeam.name}: ${pickLabel(i.featured!, i.homeTeam.name, i.awayTeam.name)} (${pct(i.featured!.probability, 0)})`);
  const head = `🔮 ORACLE ODDS · Pronósticos · ${week}${leagueName ? ` · ${leagueName}` : ''}`;
  const record = finished.length ? `\nDestacados ya jugados: ${ratio(d.summary.featured.won, d.summary.featured.settled)} acertados.` : '';
  const body = lines.length ? `\n\n${lines.join('\n')}` : '';
  return `${head}${record}${body}\n\nEstimaciones estadísticas, no garantías. +18. Juega con responsabilidad.`;
}

type SP = Promise<{ semana?: string; liga?: string }>;

export default async function PicksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const offset = Math.max(-8, Math.min(8, Number.parseInt(sp.semana ?? '0', 10) || 0));
  const qs = new URLSearchParams({ offset: String(offset) });
  if (sp.liga) qs.set('leagueId', sp.liga);
  const [res, all] = await Promise.all([
    apiGet<WeekPicks>(`/picks/week?${qs}`, { revalidate: 120 }),
    // Ligas de toda la semana (sin filtro) para las pestañas.
    sp.liga ? apiGet<WeekPicks>(`/picks/week?offset=${offset}`, { revalidate: 120 }) : Promise.resolve(null),
  ]);
  const week = WEEKS.find((w) => w.offset === offset)?.label ?? (offset < 0 ? `Hace ${-offset} semanas` : `En ${offset} semanas`);
  const link = (patch: { semana?: number; liga?: string | null }) => {
    const p = new URLSearchParams();
    const s = patch.semana ?? offset;
    if (s !== 0) p.set('semana', String(s));
    const l = patch.liga === undefined ? sp.liga : patch.liga;
    if (l) p.set('liga', l);
    const q = p.toString();
    return `/pronosticos${q ? `?${q}` : ''}`;
  };

  if (!res.ok) {
    return (
      <>
        <PageHeader eyebrow="Pronósticos del modelo" title="Pronósticos por semana" />
        <DataUnavailable error={res.error} />
      </>
    );
  }
  const d = res.data;
  const leagues = (all && all.ok ? all.data.leagues : d.leagues).slice().sort((a, b) => b.fixtures - a.fixtures);
  const leagueName = sp.liga ? (leagues.find((l) => l.id === sp.liga)?.name ?? null) : null;

  const groups = new Map<string, Map<string, WeekPick[]>>();
  for (const m of d.items) {
    const day = formatDay(m.kickoff);
    const byLeague = groups.get(day) ?? new Map<string, WeekPick[]>();
    const key = `${m.league.name}${m.league.country ? ` · ${m.league.country}` : ''}`;
    byLeague.set(key, [...(byLeague.get(key) ?? []), m]);
    groups.set(day, byLeague);
  }
  const shareUrl = `${SITE_URL}${link({})}`;

  return (
    <>
      <PageHeader eyebrow="Pronósticos del modelo" title="Pronósticos por semana">
        {formatKickoff(d.range.from, { dateStyle: 'long' })} – {formatKickoff(new Date(new Date(d.range.to).getTime() - 1).toISOString(), { dateStyle: 'long' })} · hora de Colombia.
        Probabilidades de un modelo estadístico calibrado con resultados reales; los partidos ya jugados muestran si el pronóstico acertó.
      </PageHeader>

      <nav aria-label="Semana" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 whitespace-nowrap">
          {WEEKS.map((w) => (
            <li key={w.offset}>
              <Link href={link({ semana: w.offset })} aria-current={w.offset === offset ? 'page' : undefined} className={w.offset === offset ? 'btn-primary' : 'btn-ghost'}>
                {w.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {leagues.length > 0 && (
        <nav aria-label="Liga" className="-mx-4 mt-4 overflow-x-auto px-4">
          <ul className="flex gap-2 whitespace-nowrap">
            <li><Link href={link({ liga: null })} className={`chip ${!sp.liga ? 'border-gold/60 text-gold' : ''}`}>Todas</Link></li>
            {leagues.map((l) => (
              <li key={l.id}>
                <Link href={link({ liga: l.id })} className={`chip ${sp.liga === l.id ? 'border-gold/60 text-gold' : ''}`}>
                  {l.name} <span className="tabular text-muted">{l.fixtures}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section aria-label="Resumen" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-4">
          <p className="text-xs text-muted">Partidos</p>
          <p className="tabular mt-1 font-display text-2xl font-bold">{d.summary.fixtures}</p>
          <p className="text-[11px] text-muted">{d.summary.withPrediction} con pronóstico · {d.summary.finished} jugados</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">★ Destacados acertados</p>
          <p className="tabular mt-1 font-display text-2xl font-bold text-gold">{ratio(d.summary.featured.won, d.summary.featured.settled)}</p>
          <p className="text-[11px] text-muted">Selección más probable con ≥ 55 %</p>
        </div>
        {d.summary.byMarket.map((m) => (
          <div key={m.marketKey} className="card p-4">
            <p className="text-xs text-muted">{MARKET_LABEL[m.marketKey]}</p>
            <p className="tabular mt-1 font-display text-2xl font-bold">{ratio(m.won, m.settled)}</p>
            <p className="text-[11px] text-muted">Selección más probable</p>
          </div>
        ))}
      </section>

      {d.unpublishedMarkets.length > 0 && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          Mercados aún en validación (no se muestran): {d.unpublishedMarkets.map((m) => `${MARKET_LABEL[m.marketKey] ?? m.marketKey} — ${m.reason}`).join(' · ')}
        </p>
      )}

      {d.items.some((i) => i.featured) && (
        <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">Comparte los pronósticos destacados ({week.toLowerCase()}{leagueName ? ` · ${leagueName}` : ''}).</p>
          <SharePicks text={shareText(d, week, leagueName)} url={shareUrl} />
        </div>
      )}

      <div className="mt-8 space-y-10">
        {d.items.length === 0 ? (
          <EmptyState title="Sin partidos esta semana para estos filtros">
            <p>Puede ser una fecha FIFA o un parón de liga. Prueba otra semana o revisa el <Link href="/status" className="underline">estado de los datos</Link>.</p>
          </EmptyState>
        ) : (
          [...groups.entries()].map(([day, byLeague]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-3 font-display text-lg font-bold capitalize">{day}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {[...byLeague.entries()].map(([league, items]) => (
                  <div key={league} className="card p-3">
                    <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">{league}</h3>
                    <ul className="grid gap-2">{items.map((m) => <MatchCard key={m.id} m={m} />)}</ul>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <p className="mt-10 text-xs text-muted">
        Las cuotas mostradas son una referencia de mercado (no un operador autorizado en Colombia) y solo sirven para comparar con la cuota justa del modelo.
        Un pronóstico es una estimación de probabilidad: puede fallar. +18. Juega con responsabilidad — <Link href="/responsible-gambling" className="underline">más información</Link>.
      </p>
    </>
  );
}
