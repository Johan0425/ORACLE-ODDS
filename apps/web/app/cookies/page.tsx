import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';

export const metadata: Metadata = { title: 'Política de cookies' };

export default function CookiesPage() {
  return (
    <>
      <PageHeader title="Política de cookies" eyebrow="Transparencia" />
      <Prose>
        <ul>
          <li><strong>oo_age_ok</strong> (cookie técnica, 12 meses): recuerda que declaraste ser mayor de 18 años.</li>
          <li><strong>oo-betslip-v1</strong> (almacenamiento local): tu Bet Slip simulado.</li>
          <li><strong>oo_my_challenges / oo_challenge_token_*</strong> (almacenamiento local): acceso a retos que creaste o en los que participas.</li>
          <li><strong>oo_cookie_choice</strong> (almacenamiento local): tu elección de cookies.</li>
          <li><strong>oo_sponsor_impressions</strong> (almacenamiento local): tope de frecuencia de piezas patrocinadas.</li>
        </ul>
        <p>No instalamos cookies publicitarias ni de seguimiento de terceros. Si en el futuro se habilita analítica, será respetuosa de la privacidad y dependerá de tu elección.</p>
      </Prose>
    </>
  );
}
