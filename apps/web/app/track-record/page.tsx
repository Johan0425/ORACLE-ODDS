import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, type ModelMetrics, type TrackRecord } from '@/lib/api';
import { marketName, pct, units } from '@/lib/format';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { TrackRecordTable } from '@/components/track/TrackRecordTable';
import { CalibrationChart, EquityChart } from '@/components/track/Charts';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Historial auditable', description: 'Todas las oportunidades publicadas, ganadas y perdidas, con ROI, yield, CLV, drawdown y calibración.' };
export const revalidate = 300;

type SP = Promise<{ market?: string; result?: string; oddsBucket?: string; page?: string }>;

export default async function TrackRecordPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ limit: '50', page: sp.page ?? '1' });
  if (sp.market) qs.set('market', sp.market);
  if (sp.result) qs.set('result', sp.result);
  if (sp.oddsBucket) qs.set('oddsBucket', sp.oddsBucket);
  const [track, metrics] = await Promise.all([apiGet<TrackRecord>(`/track-record?${qs}`), apiGet<ModelMetrics>('/model-metrics')]);
  const liveCal = metrics.ok ? metrics.data.snapshots.filter((s) => s.source === 'live-calibration' && s.sampleSize > 0) : [];
  const s = track.ok ? track.data.summary : null;

  return (
    <>
      <PageHeader eyebrow="Transparencia" title="Historial auditable">
        Cada oportunidad publicada se registra con su cuota, probabilidad y fecha, y se liquida automáticamente con el resultado oficial. No eliminamos predicciones perdedoras. Stake plano de 1 unidad a la cuota de publicación.
      </PageHeader>
      {!track.ok ? (
        <DataUnavailable error={track.error} />
      ) : (
        <>
          <dl className="tabular grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            {[
              ['Publicadas', String(s!.counts.total)],
              ['Ganadas', String(s!.counts.won)],
              ['Perdidas', String(s!.counts.lost)],
              ['Push / anuladas', `${s!.counts.push} / ${s!.counts.void}`],
              ['ROI', pct(s!.roi)],
              ['IC 95% ROI', s!.roiCi ? `${pct(s!.roiCi.lower, 0)} a ${pct(s!.roiCi.upper, 0)}` : '—'],
              ['Máx. drawdown', units(-s!.maxDrawdown)],
              ['CLV medio', s!.avgClv == null ? '—' : `${pct(s!.avgClv)} (n=${s!.clvSample})`],
            ].map(([k, v]) => (
              <div key={k} className="card p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-1 font-display text-lg font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">
            Hit rate {pct(s!.hitRate)} · beneficio {units(s!.profit)} · pendientes {s!.counts.pending} · retiradas antes del inicio {s!.counts.withdrawnBeforeKickoff}. Muestras pequeñas producen intervalos amplios: el resultado puede deberse al azar.
          </p>

          <Section title="Beneficio acumulado" id="equity">
            {track.data.equity.length < 2 ? <p className="text-sm text-muted">Se mostrará cuando haya al menos dos liquidaciones.</p> : <div className="card p-4"><EquityChart points={track.data.equity} /></div>}
          </Section>

          <Section title="Calibración real (predicciones emitidas antes del inicio)" id="calibration">
            {liveCal.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay suficientes predicciones liquidadas. La validación fuera de muestra del backtest está en <Link className="underline" href="/methodology#metricas">Metodología</Link>.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {liveCal.slice(0, 4).map((m) => (
                  <div key={m.marketKey} className="card p-4">
                    <h3 className="text-sm font-semibold">{marketName(m.marketKey)} <span className="font-normal text-muted">· n={m.sampleSize} · Brier {m.brier?.toFixed(3)} · ECE {m.ece?.toFixed(3)}</span></h3>
                    <CalibrationChart bins={Array.isArray(m.calibrationCurve) ? (m.calibrationCurve as Array<{ meanPredicted: number; observedRate: number; count: number }>) : []} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Todas las oportunidades" id="items">
            <form action="/track-record" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filtros">
              <label className="text-xs text-muted">Resultado
                <select name="result" defaultValue={sp.result ?? ''} className="input mt-1">
                  <option value="">Todos</option><option value="WIN">Ganadas</option><option value="LOSS">Perdidas</option><option value="PUSH">Push</option><option value="VOID">Anuladas</option>
                </select>
              </label>
              <label className="text-xs text-muted">Rango de cuota
                <select name="oddsBucket" defaultValue={sp.oddsBucket ?? ''} className="input mt-1">
                  <option value="">Todos</option>{['1.01-1.49', '1.50-1.99', '2.00-2.99', '3.00-4.99', '5.00+'].map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <button className="btn-primary" type="submit">Filtrar</button>
            </form>
            {track.data.items.length === 0 ? <EmptyState title="Todavía no hay oportunidades publicadas" /> : <TrackRecordTable items={track.data.items} />}
          </Section>
        </>
      )}
    </>
  );
}
