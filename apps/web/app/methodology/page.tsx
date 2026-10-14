import type { Metadata } from 'next';
import { apiGet, type ModelMetrics } from '@/lib/api';
import { formatKickoff, marketName, pct } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';

export const metadata: Metadata = { title: 'Metodología', description: 'Cómo estimamos probabilidades, validamos el modelo fuera de muestra y detectamos valor. Limitaciones y fuentes.' };
export const revalidate = 600;

export default async function MethodologyPage() {
  const metrics = await apiGet<ModelMetrics>('/model-metrics');
  const backtest = metrics.ok ? metrics.data.snapshots.filter((s) => s.source === 'backtest' && !s.leagueId && !s.oddsBucket && s.marketKey) : [];
  return (
    <>
      <PageHeader eyebrow="Cómo funciona" title="Metodología">
        Modelo probabilístico versionado y auditable. No es inteligencia artificial generativa ni un sistema que “adivine” resultados.
      </PageHeader>
      <Prose>
        <h2>1. Datos</h2>
        <p>Partidos, resultados, estadísticas, alineaciones y lesiones provienen de API-Football; las cuotas de varias casas, de The Odds API (y opcionalmente odds-api.io). TheSportsDB solo aporta escudos y metadatos. Cada entidad externa se mapea a un identificador interno; nunca se deduplica solo por nombre. Si un proveedor no entrega un dato, el campo queda vacío: no se rellena con valores inventados.</p>
        <h2>2. Modelo de fútbol (ensemble)</h2>
        <ul>
          <li><strong>Dixon-Coles</strong>: goles esperados a partir de fuerzas de ataque/defensa separadas como local y visitante, con decaimiento temporal (vida media 180 días) y contracción hacia el promedio de la liga; corrección de marcadores bajos (ρ).</li>
          <li><strong>Elo</strong> con multiplicador por diferencia de goles y regresión a la media por inactividad.</li>
          <li><strong>Consenso de mercado sin margen</strong> como una entrada más (peso 25%), nunca copiado como resultado.</li>
          <li>Ajustes acotados por descanso, congestión de calendario, ausencias confirmadas y fuerza de liga; H2H con peso bajo y decaimiento; xG solo si el proveedor lo suministra.</li>
        </ul>
        <p>La combinación es un pooling log-lineal ponderado. Córners, tarjetas y mitades solo se calculan con historial suficiente; el marcador correcto solo con soporte de datos alto.</p>
        <h2>3. Sin fuga de información</h2>
        <p>Cada predicción registra su <strong>fecha de corte</strong>: el motor rechaza cualquier partido o cuota posterior a ese instante. Las cuotas de cierre nunca se usan para una predicción hecha horas antes.</p>
        <h2>4. Calibración y validación</h2>
        <p>Validación walk-forward temporal: se predice cada partido terminado usando solo datos previos. La calibración (Platt con 150+ muestras, isotónica con 1.000+) se ajusta en la parte antigua de la muestra y se evalúa en la reciente. Un mercado solo se publica si tiene muestra suficiente, error de calibración (ECE) bajo y mejor Brier que la frecuencia base.</p>
        <h2>5. Valor y calidad</h2>
        <p>Probabilidad implícita = 1/cuota. Quitamos el margen de la casa (método de potencia por defecto; también proporcional y Shin). Edge = probabilidad del modelo − probabilidad de mercado sin margen. EV = probabilidad × cuota − 1. La puntuación de calidad (0-100) penaliza cuotas vencidas, poca cobertura, mala calibración, alineaciones desconocidas, mercados poco líquidos, incertidumbre alta y movimientos adversos. Una selección muy probable puede no tener valor si la cuota no compensa el riesgo.</p>
        <h2>6. Limitaciones</h2>
        <ul>
          <li>Ningún modelo predice el resultado de un partido con certeza; la varianza es alta incluso con ventaja real.</li>
          <li>Las cuotas cambian rápido y algunas casas limitan cuentas; un arbitraje matemático puede desaparecer en segundos.</li>
          <li>Con pocas muestras, el ROI histórico puede deberse al azar: mira los intervalos de confianza.</li>
          <li>Solo fútbol tiene modelo; en otros deportes ofrecemos comparación de cuotas.</li>
          <li>No existe predicción legítima para casino o juegos basados en generadores aleatorios: no ofrecemos “señales” de casino.</li>
        </ul>
      </Prose>

      <section id="metricas" className="mt-12" aria-labelledby="metrics-title">
        <h2 id="metrics-title" className="font-display text-xl font-bold">Métricas fuera de muestra por mercado</h2>
        {!metrics.ok ? (
          <p className="mt-2 text-sm text-muted">Métricas no disponibles en este momento.</p>
        ) : backtest.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Aún no hay evaluación: se calcula cuando hay historial sincronizado suficiente. Modelo vigente: {metrics.data.modelVersion}.</p>
        ) : (
          <div className="card mt-4 overflow-x-auto p-2">
            <table className="tabular w-full min-w-[720px] text-sm">
              <caption className="p-2 text-left text-xs text-muted">Modelo {metrics.data.modelVersion} · umbrales de publicación: n ≥ {metrics.data.thresholds.minSamples}, ECE ≤ {metrics.data.thresholds.maxEce}</caption>
              <thead className="text-left text-xs text-muted">
                <tr>{['Mercado', 'Muestras', 'Brier', 'Log loss', 'ECE', 'Accuracy (secundaria)', 'Publicado', 'Calculado'].map((h) => <th key={h} scope="col" className="px-2 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {backtest.map((m) => (
                  <tr key={m.marketKey} className="border-t border-line">
                    <th scope="row" className="px-2 py-2 text-left font-medium">{marketName(m.marketKey)}</th>
                    <td className="px-2">{m.sampleSize}</td>
                    <td className="px-2">{m.brier?.toFixed(4) ?? '—'}</td>
                    <td className="px-2">{m.logLoss?.toFixed(4) ?? '—'}</td>
                    <td className="px-2">{m.ece?.toFixed(4) ?? '—'}</td>
                    <td className="px-2">{pct(m.accuracy)}</td>
                    <td className={`px-2 ${m.isPublishable ? 'text-positive' : 'text-warning'}`}>{m.isPublishable ? 'Sí' : 'No'}</td>
                    <td className="px-2 text-muted">{formatKickoff(m.computedAt, { dateStyle: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
