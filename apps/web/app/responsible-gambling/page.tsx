import type { Metadata } from 'next';
import { COMPLIANCE } from '@/lib/compliance';
import { PageHeader } from '@/components/layout/PageHeader';
import { Prose } from '@/components/layout/Prose';

export const metadata: Metadata = { title: 'Juego responsable', description: 'Ayuda, límites y recursos oficiales. Solo mayores de 18 años.' };

export default function ResponsibleGamblingPage() {
  return (
    <>
      <PageHeader eyebrow="18+" title="Juego responsable">{COMPLIANCE.addiction}</PageHeader>
      <Prose>
        <p>Apostar debe ser, si acaso, una forma de entretenimiento con dinero que puedes permitirte perder. Ninguna estimación estadística elimina el riesgo: incluso con una ventaja real, las rachas perdedoras largas son normales.</p>
        <h2>Señales de alerta</h2>
        <ul>
          <li>Apostar para recuperar pérdidas o aumentar el monto para “desquitarte”.</li>
          <li>Ocultar cuánto tiempo o dinero dedicas a apostar.</li>
          <li>Pedir prestado o usar dinero destinado a gastos esenciales.</li>
          <li>Sentir ansiedad o irritabilidad cuando no apuestas.</li>
        </ul>
        <h2>Pon límites</h2>
        <ul>
          <li>Define un presupuesto mensual y un tope diario y semanal antes de empezar; nuestra calculadora educativa los aplica a la simulación.</li>
          <li>Usa las herramientas de límite de depósito, pausa y autoexclusión que deben ofrecer los operadores autorizados.</li>
          <li>Nunca uses martingalas ni estrategias de recuperación de pérdidas.</li>
          <li>Haz pausas y no apuestes bajo efectos del alcohol o en momentos de estrés.</li>
        </ul>
        <h2>Mayores de edad</h2>
        <p>{COMPLIANCE.noMinors} Si convives con menores, usa controles parentales en tus dispositivos.</p>
        <h2>Recursos de ayuda</h2>
        <ul>
          {COMPLIANCE.resources.map((r) => (
            <li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a></li>
          ))}
        </ul>
        <p>Si sientes que has perdido el control, busca ayuda profesional y considera la autoexclusión con tu operador.</p>
        <h2>Qué es ORACLE ODDS</h2>
        <p>{COMPLIANCE.notOperator}</p>
      </Prose>
    </>
  );
}
