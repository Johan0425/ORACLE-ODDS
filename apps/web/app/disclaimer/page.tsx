import type { Metadata } from 'next';
import { COMPLIANCE } from '@/lib/compliance';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';

export const metadata: Metadata = { title: 'Descargo de responsabilidad' };

export default function DisclaimerPage() {
  return (
    <>
      <PageHeader title="Descargo de responsabilidad" eyebrow="Importante" />
      <Prose>
        <p>{COMPLIANCE.disclaimer}</p>
        <p>{COMPLIANCE.oddsChange}</p>
        <p>{COMPLIANCE.forecastNotGuarantee} El rendimiento histórico no garantiza resultados futuros. Ninguna selección es “segura”, “garantizada” o “infalible”.</p>
        <p>{COMPLIANCE.addiction}</p>
      </Prose>
    </>
  );
}
