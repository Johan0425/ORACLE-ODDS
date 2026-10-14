import Link from 'next/link';

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** Aviso permanente cuando el sitio muestra datos ficticios de demostración. */
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div role="note" className="border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-xs font-medium text-warning" data-testid="demo-banner">
      MODO DEMOSTRACIÓN · Ligas, equipos, casas de apuestas, cuotas y resultados son <strong>ficticios</strong>, generados para mostrar el producto. No son datos reales ni sirven para apostar.{' '}
      <Link href="/status" className="underline">Más información</Link>
    </div>
  );
}
