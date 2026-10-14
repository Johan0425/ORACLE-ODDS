import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';

export const metadata: Metadata = { title: 'Política de privacidad' };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Política de privacidad" eyebrow="Datos personales" />
      <Prose>
        <p>ORACLE ODDS funciona sin cuentas de usuario. Minimizamos los datos que tratamos:</p>
        <ul>
          <li><strong>Sin IP en claro.</strong> Para limitar abusos y contar clics de afiliado generamos un identificador anónimo con un hash de IP y navegador combinado con una sal que rota cada día; no es reversible ni permite seguirte entre días.</li>
          <li><strong>Retos.</strong> Guardamos el alias que elijas, tus selecciones y un hash del token de participante. No pidas ni publiques datos personales en el alias.</li>
          <li><strong>Newsletter (opcional).</strong> Si te suscribes, guardamos tu correo y el texto de consentimiento; puedes darte de baja en cualquier momento.</li>
          <li><strong>Almacenamiento local.</strong> Tu Bet Slip y los secretos de tus retos se guardan en tu navegador, no en nuestros servidores.</li>
        </ul>
        <h2>Retención</h2>
        <p>Los registros de clics se conservan 13 meses para conciliación con operadores; los registros técnicos (logs), 30 días. Los retos se archivan 30 días después de cerrar.</p>
        <h2>Derechos</h2>
        <p>Puedes solicitar acceso, corrección o supresión de los datos asociados a tu correo de newsletter escribiendo al responsable del tratamiento indicado en los términos de uso.</p>
      </Prose>
    </>
  );
}
