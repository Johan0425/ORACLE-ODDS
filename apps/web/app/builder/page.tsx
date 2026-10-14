import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { BetSlipPanel } from '@/components/slip/BetSlipPanel';
import { RiskDisclosure } from '@/components/compliance/RiskDisclosure';

export const metadata: Metadata = { title: 'Constructor de combinadas', description: 'Simula sencillas, combinadas y sistemas con cuotas actualizadas y ajuste por correlación. Sin dinero real.' };

export default function BuilderPage() {
  return (
    <>
      <PageHeader eyebrow="Simulador" title="Combinadas y sistemas">
        Construye sencillas, combinadas o sistemas (2/3, 3/4…) en unidades. Actualizamos las cuotas antes de analizar, bloqueamos selecciones contradictorias y, para selecciones del mismo partido, calculamos la probabilidad conjunta con el modelo de marcadores o aplicamos una penalización visible.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card p-5" aria-label="Tu slip">
          <BetSlipPanel />
        </section>
        <aside className="space-y-4 text-sm text-muted">
          <div className="card p-4">
            <h2 className="font-semibold text-foreground">Cómo leer el análisis</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Independencia ingenua</strong>: producto de probabilidades; solo es razonable entre partidos distintos.</li>
              <li><strong>Prob. conjunta</strong>: ajustada por correlación cuando hay selecciones del mismo partido.</li>
              <li><strong>EV</strong>: valor esperado por unidad; negativo significa que la cuota no compensa el riesgo.</li>
              <li>Cada selección adicional multiplica el riesgo: revisa su impacto individual.</li>
            </ul>
          </div>
          <RiskDisclosure compact />
        </aside>
      </div>
    </>
  );
}
