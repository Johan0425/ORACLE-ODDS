'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState title="Algo salió mal" tone="warning" action={<button type="button" className="btn-primary" onClick={reset}>Reintentar</button>}>
      <p>No mostramos datos sustitutos. Intenta de nuevo en unos segundos.</p>
    </EmptyState>
  );
}
