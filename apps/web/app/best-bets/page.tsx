import type { Metadata } from 'next';
import Link from 'next/link';
import { MARKET_DEFINITIONS } from '@oracle-odds/probability-engine';
import { apiGet, type League, type ValueBetList } from '@/lib/api';
import { formatKickoff, marketName, odds, pct, points, selectionName, signedPct } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { ValueBetCard } from '@/components/odds/ValueBetCard';
import { RiskDisclosure } from '@/components/compliance/RiskDisclosure';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Mejores oportunidades', description: 'Selecciones donde la probabilidad estimada supera a la del mercado sin margen, ordenadas por calidad.' };
export const revalidate = 60;

type SP = Promise<Record<string, string | undefined>>;
const FILTERS = ['sport', 'leagueId', 'market', 'minEdge', 'minEv', 'minConfidence', 'minOdds', 'maxOdds', 'from', 'to', 'sort', 'view'] as const;

export default async function BestBetsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ limit: '60' });
  for (const k of FILTERS) if (sp[k] && k !== 'view') qs.set(k, sp[k]!);
  const pctParam = (k: 'minEdge' | 'minEv' | 'minConfidence') => (sp[k] ? qs.set(k, String(Number(sp[k]) / 100)) : undefined);
  pctParam('minEdge');
  pctParam('minEv');
  pctParam('minConfidence');
  const [list, leagues] = await Promise.all([apiGet<ValueBetList>(`/value-bets?${qs}`), apiGet<League[]>('/leagues', { revalidate: 600 })]);
  const view = sp.view === 'table' ? 'table' : 'cards';
  const viewHref = (v: string) => `/best-bets?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, x]) => x) as [string, string][]), view: v })}`;

  return (
    <>
      <PageHeader eyebrow="Valor esperado" title="Mejores oportunidades">
        Ordenadas por puntuación de calidad: combina edge, valor esperado, calibración, frescura de la cuota, cobertura de casas e incertidumbre. No ordenamos por probabilidad: un favorito muy probable puede no tener valor.
      </PageHeader>

      <form action="/best-bets" className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6" role="search" aria-label="Filtros">
        <label className="text-xs text-muted">Deporte
          <select name="sport" defaultValue={sp.sport ?? ''} className="input mt-1"><option value="">Todos</option><option value="FOOTBALL">Fútbol</option></select>
        </label>
        <label className="text-xs text-muted">Liga
          <select name="leagueId" defaultValue={sp.leagueId ?? ''} className="input mt-1">
            <option value="">Todas</option>
            {leagues.ok && leagues.data.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Mercado
          <select name="market" defaultValue={sp.market ?? ''} className="input mt-1">
            <option value="">Todos</option>
            {Object.values(MARKET_DEFINITIONS).filter((m) => m.sports.includes('FOOTBALL')).map((m) => <option key={m.key} value={m.key}>{m.displayName}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Edge mín. (p.p.)<input name="minEdge" type="number" step="0.5" min="0" defaultValue={sp.minEdge ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">EV mín. (%)<input name="minEv" type="number" step="0.5" min="0" defaultValue={sp.minEv ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">Confianza mín. (%)<input name="minConfidence" type="number" step="5" min="0" max="100" defaultValue={sp.minConfidence ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">Cuota mín.<input name="minOdds" type="number" step="0.05" min="1.01" defaultValue={sp.minOdds ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">Cuota máx.<input name="maxOdds" type="number" step="0.05" min="1.01" defaultValue={sp.maxOdds ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">Desde<input name="from" type="datetime-local" defaultValue={sp.from ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">Hasta<input name="to" type="datetime-local" defaultValue={sp.to ?? ''} className="input mt-1" /></label>
        <label className="text-xs text-muted">Orden
          <select name="sort" defaultValue={sp.sort ?? 'quality'} className="input mt-1">
            <option value="quality">Calidad</option><option value="edge">Edge</option><option value="ev">EV</option><option value="kickoff">Hora</option>
          </select>
        </label>
        <input type="hidden" name="view" value={view} />
        <div className="flex items-end"><button className="btn-primary w-full" type="submit">Aplicar</button></div>
      </form>

      <div className="mt-4 flex items-center gap-2 text-sm" role="group" aria-label="Vista">
        <Link href={viewHref('cards')} aria-current={view === 'cards' ? 'true' : undefined} className={view === 'cards' ? 'btn-primary' : 'btn-ghost'}>Tarjetas</Link>
        <Link href={viewHref('table')} aria-current={view === 'table' ? 'true' : undefined} className={view === 'table' ? 'btn-primary' : 'btn-ghost'}>Tabla</Link>
        {list.ok && <span className="ml-2 text-muted">{list.data.meta.total} oportunidades</span>}
      </div>

      <div className="mt-6">
        {!list.ok ? (
          <DataUnavailable error={list.error} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Ninguna selección supera los umbrales con estos filtros">
            <p>Publicamos solo cuando la ventaja es clara, la cuota está fresca y el mercado está validado. Revisa el <Link href="/status" className="underline">estado de los datos</Link> o amplía los filtros.</p>
          </EmptyState>
        ) : view === 'cards' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.data.items.map((vb) => <ValueBetCard key={vb.id} vb={vb} />)}
          </div>
        ) : (
          <div className="card overflow-x-auto p-2">
            <table className="tabular w-full min-w-[900px] text-sm">
              <caption className="sr-only">Oportunidades de valor</caption>
              <thead className="text-left text-xs text-muted">
                <tr>{['Q', 'Partido', 'Inicio', 'Mercado', 'Selección', 'Cuota', 'Casa', 'Modelo', 'Mercado s/vig', 'Cuota justa', 'Edge', 'EV'].map((h) => <th key={h} scope="col" className="px-2 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {list.data.items.map((vb) => (
                  <tr key={vb.id} className="border-t border-line">
                    <td className="px-2 py-2 font-bold text-gold">{vb.qualityScore.toFixed(0)}</td>
                    <td className="px-2"><Link className="hover:text-gold-soft" href={`/matches/${vb.fixture.id}`}>{vb.fixture.homeTeam.name} vs {vb.fixture.awayTeam.name}</Link></td>
                    <td className="px-2 text-muted">{formatKickoff(vb.fixture.kickoff, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-2">{marketName(vb.marketKey)}</td>
                    <td className="px-2">{selectionName(vb.marketKey, vb.selectionKey, vb.line, vb.fixture.homeTeam.name, vb.fixture.awayTeam.name)}</td>
                    <td className="px-2 font-semibold text-gold-soft">{odds(vb.comparison[0]?.price ?? vb.price)}</td>
                    <td className="px-2">{vb.comparison[0]?.bookmaker.name ?? vb.bookmakerSlug}</td>
                    <td className="px-2">{pct(vb.probability)}</td>
                    <td className="px-2">{pct(vb.marketProbability)}</td>
                    <td className="px-2">{odds(vb.fairOdds)}</td>
                    <td className="px-2">{points(vb.edge)}</td>
                    <td className="px-2">{signedPct(vb.expectedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-8"><RiskDisclosure /></div>
    </>
  );
}
