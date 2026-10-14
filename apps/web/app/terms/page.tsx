import type { Metadata } from 'next';
import { COMPLIANCE } from '@/lib/compliance';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';

export const metadata: Metadata = { title: 'Términos de uso' };

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Términos de uso" eyebrow="Condiciones" />
      <Prose>
        <p>{COMPLIANCE.notOperator}</p>
        <ul>
          <li>Uso exclusivo para mayores de 18 años.</li>
          <li>La información es estadística e informativa; no constituye asesoría financiera ni promesa de ganancia.</li>
          <li>Las cuotas provienen de terceros y pueden estar desactualizadas o contener errores; verifica siempre con el operador.</li>
          <li>Los retos sociales no admiten dinero real, pagos, depósitos ni premios monetarios. Podemos ocultar contenido ofensivo o que incumpla estas reglas.</li>
          <li>Prohibido el uso automatizado abusivo (scraping masivo, evasión de límites).</li>
          <li>Los enlaces de afiliado están identificados; podemos recibir comisiones de operadores autorizados.</li>
        </ul>
      </Prose>
    </>
  );
}
