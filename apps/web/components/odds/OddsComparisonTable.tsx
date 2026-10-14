'use client';

import { useMemo, useState } from 'react';
import type { OddsComparison, OddsMarket } from '@/lib/api';
import { odds, relativeAge, selectionName, signedPct, pct } from '@/lib/format';
import { FreshnessBadge, SponsoredTag } from '../ui/Badges';
import { AddToSlipButton } from './AddToSlipButton';
import { IS_DEMO } from '../compliance/DemoBanner';

interface Props {
  data: OddsComparison;
  fixture: { id: string; home: string; away: string; kickoff: string };
  probabilities?: Record<string, number>;
}

const goHref = (slug: string, fixtureId: string) => `/go?bookmaker=${encodeURIComponent(slug)}&placement=comparator&fixtureId=${encodeURIComponent(fixtureId)}`;

/**
 * Comparador por mercado: mejor cuota resaltada, diferencia frente al
 * promedio, apertura → actual, frescura y enlace al operador (marcado si es de
 * afiliado). En móvil cada selección se presenta como tarjeta.
 */
/** Enlace al operador vía /go. En modo demo las casas son ficticias: solo se muestra el nombre. */
function BookLink({ slug, fixtureId, children }: { slug: string; fixtureId: string; children: React.ReactNode }) {
  if (IS_DEMO) return <span>{children}</span>;
  return (
    <a href={goHref(slug, fixtureId)} rel="sponsored nofollow noopener" target="_blank" className="hover:text-gold-soft">
      {children}
    </a>
  );
}

export function OddsComparisonTable({ data, fixture, probabilities = {} }: Props) {
  const markets = data.markets;
  const [marketKey, setMarketKey] = useState(() => (markets.find((m) => m.marketKey === '1X2') ?? markets[0])?.marketKey + '|' + (markets.find((m) => m.marketKey === '1X2') ?? markets[0])?.lineKey);
  const [sortBy, setSortBy] = useState<'price' | 'name'>('price');
  const current: OddsMarket | undefined = markets.find((m) => `${m.marketKey}|${m.lineKey}` === marketKey) ?? markets[0];
  const books = useMemo(() => {
    const set = new Map<string, { slug: string; name: string }>();
    current?.selections.forEach((s) => s.quotes.forEach((q) => set.set(q.bookmaker.slug, q.bookmaker)));
    return [...set.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [current]);

  if (!current) return null;
  const staleThreshold = data.live ? 120 : 7200;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted">
          Mercado{' '}
          <select className="input ml-1 inline-block w-auto" value={marketKey} onChange={(e) => setMarketKey(e.target.value)} aria-label="Elegir mercado">
            {markets.map((m) => (
              <option key={`${m.marketKey}|${m.lineKey}`} value={`${m.marketKey}|${m.lineKey}`}>
                {m.displayName}
                {m.line != null ? ` (${m.line})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Ordenar{' '}
          <select className="input ml-1 inline-block w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'price' | 'name')}>
            <option value="price">Mejor cuota</option>
            <option value="name">Casa (A-Z)</option>
          </select>
        </label>
        <span className="text-xs text-muted">
          Última actualización {data.lastUpdate ? relativeAge((Date.now() - Date.parse(data.lastUpdate)) / 1000) : '—'} · solo casas autorizadas
          {current.hiddenStale > 0 ? ` · ${current.hiddenStale} cuotas vencidas ocultas` : ''}
        </span>
      </div>

      {/* Escritorio: matriz casas × selecciones */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Comparación de cuotas — {current.displayName}</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted">
              <th scope="col" className="py-2 pr-3">Casa</th>
              {current.selections.map((s) => (
                <th scope="col" key={s.selectionKey} className="px-3 py-2 text-right">
                  {selectionName(current.marketKey, s.selectionKey, current.line, fixture.home, fixture.away)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">Actualizada</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => {
              const row = current.selections.map((s) => s.quotes.find((q) => q.bookmaker.slug === b.slug));
              const age = Math.min(...row.filter(Boolean).map((q) => q!.ageSeconds));
              return (
                <tr key={b.slug} className="border-t border-line">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    <BookLink slug={b.slug} fixtureId={fixture.id}>{b.name}</BookLink>{' '}
                    {row.some((q) => q?.isAffiliate) && <SponsoredTag />}
                  </th>
                  {row.map((q, i) => {
                    const best = current.selections[i].best?.bookmaker.slug === b.slug;
                    return (
                      <td key={i} className="px-3 py-2 text-right">
                        {q ? (
                          <span className={`tabular inline-flex flex-col items-end ${best ? 'text-gold-soft' : ''}`}>
                            <span className={`font-semibold ${best ? 'rounded bg-gold/15 px-1.5' : ''}`}>{odds(q.price)}</span>
                            <span className="text-[11px] text-muted" title={`Apertura ${odds(q.openingPrice)}`}>
                              {odds(q.openingPrice)} → {signedPct(q.movementFromOpening)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    <FreshnessBadge ageSeconds={Number.isFinite(age) ? age : null} staleAfter={staleThreshold} freshUntil={data.live ? 20 : 900} live={data.live} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line text-xs text-muted">
              <th scope="row" className="py-2 text-left font-normal">Promedio · prob. modelo</th>
              {current.selections.map((s) => (
                <td key={s.selectionKey} className="tabular px-3 py-2 text-right">
                  {odds(s.average)} · {pct(probabilities[`${current.marketKey}|${current.lineKey}|${s.selectionKey}`])}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Móvil: tarjeta por selección */}
      <div className="grid gap-3 md:hidden">
        {current.selections.map((s) => {
          const quotes = sortBy === 'price' ? s.quotes : [...s.quotes].sort((a, b) => a.bookmaker.name.localeCompare(b.bookmaker.name));
          return (
            <div key={s.selectionKey} className="card p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{selectionName(current.marketKey, s.selectionKey, current.line, fixture.home, fixture.away)}</p>
                <span className="text-xs text-muted">prom. {odds(s.average)}</span>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {quotes.map((q) => (
                  <li key={q.bookmaker.slug} className="flex items-center justify-between py-2 text-sm">
                    <BookLink slug={q.bookmaker.slug} fixtureId={fixture.id}>
                      {q.bookmaker.name} {q.isAffiliate && <SponsoredTag />}
                    </BookLink>
                    <span className="tabular flex items-center gap-2">
                      <span className="text-[11px] text-muted">{signedPct(q.diffVsAverage)}</span>
                      <span className={`font-semibold ${s.best?.bookmaker.slug === q.bookmaker.slug ? 'text-gold-soft' : ''}`}>{odds(q.price)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {current.selections.map((s) =>
          s.best ? (
            <AddToSlipButton
              key={s.selectionKey}
              compact
              leg={{
                fixtureId: fixture.id,
                marketKey: current.marketKey,
                selectionKey: s.selectionKey,
                line: current.line,
                odds: s.best.price,
                bookmaker: s.best.bookmaker.slug,
                probability: probabilities[`${current.marketKey}|${current.lineKey}|${s.selectionKey}`] ?? null,
                label: `${current.displayName}: ${selectionName(current.marketKey, s.selectionKey, current.line, fixture.home, fixture.away)}`,
                fixtureLabel: `${fixture.home} vs ${fixture.away}`,
                kickoff: fixture.kickoff,
              }}
            />
          ) : null,
        )}
      </div>

      {current.arbitrage && (
        <section aria-label="Arbitraje matemático" className="rounded-xl border border-info/30 bg-info/5 p-4 text-sm">
          <p className="font-semibold text-info">Arbitraje matemático detectado (teórico)</p>
          <p className="mt-1 text-muted">
            Suma de probabilidades implícitas {pct(current.arbitrage.impliedSum)} &lt; 100%. Margen teórico {pct(current.arbitrage.theoreticalMargin, 2)} sobre 100 unidades si todas las cuotas se mantienen. Detectado {relativeAge((Date.now() - Date.parse(current.arbitrage.detectedAt)) / 1000)}.
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {current.arbitrage.stakes.map((st) => (
              <li key={st.selection} className="tabular text-muted">
                {selectionName(current.marketKey, st.selection, current.line, fixture.home, fixture.away)} @ {odds(st.price)} en {st.bookmaker}: {st.stake.toFixed(2)} u
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-warning">{current.arbitrage.warning}</p>
        </section>
      )}
      <p className="text-xs text-muted">{data.disclaimer}</p>
    </div>
  );
}
