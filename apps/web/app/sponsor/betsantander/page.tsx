import type { Metadata } from 'next';
import Link from 'next/link';
import { sponsorConfig } from '@/lib/server-data';
import { COMPLIANCE } from '@/lib/compliance';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';
import { SponsorBanner } from '@/components/compliance/SponsorBanner';

export const metadata: Metadata = { title: 'Patrocinio — BetSantander', description: 'Información del patrocinio, divulgación de afiliación y avisos regulatorios.' };
export const revalidate = 300;

export default async function SponsorPage() {
  const config = await sponsorConfig('landing');
  return (
    <>
      <PageHeader eyebrow="Contenido patrocinado" title="Patrocinio y afiliación">
        Separamos claramente el contenido editorial del comercial. El patrocinio no modifica las estimaciones del modelo ni el orden de las oportunidades.
      </PageHeader>
      {config?.enabled ? (
        <SponsorBanner config={config} headline="Conocer BetSantander" />
      ) : (
        <div className="card p-5 text-sm text-muted" role="status">
          El patrocinio de BetSantander no está activo en este momento{config?.disabledReason ? ` (${config.disabledReason})` : ''}. Solo se activa tras verificar la identidad legal del operador, su licencia para el territorio y el acuerdo de afiliación.
        </div>
      )}
      <Prose>
        <h2>Divulgación de afiliación</h2>
        <p>{COMPLIANCE.affiliateDisclosure} Los enlaces comerciales llevan la etiqueta “Enlace de afiliado” o “Patrocinado”.</p>
        <h2>Beneficios y promociones</h2>
        <p>No publicamos bonos ni promociones que no hayan sido verificados por escrito con el operador. Consulta siempre los términos y condiciones completos directamente en el sitio del operador antes de aceptar cualquier oferta.</p>
        {config?.licenseLabel && (
          <>
            <h2>Licencia</h2>
            <p>{config.licenseLabel}</p>
          </>
        )}
        <h2>Avisos regulatorios</h2>
        <ul>
          <li>{COMPLIANCE.addiction}</li>
          <li>{COMPLIANCE.notOperator}</li>
          <li>Disponible solo donde el operador esté autorizado ({config?.allowedCountries.join(', ') ?? 'CO'}).</li>
          <li>{COMPLIANCE.oddsChange}</li>
        </ul>
        <p><Link href="/responsible-gambling">Juego responsable y recursos de ayuda</Link></p>
      </Prose>
    </>
  );
}
