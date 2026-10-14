import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFound() {
  return (
    <EmptyState title="Página no encontrada" action={<Link href="/" className="btn-primary">Ir al inicio</Link>}>
      <p>El enlace puede haber vencido o el partido ya no estar disponible.</p>
    </EmptyState>
  );
}
