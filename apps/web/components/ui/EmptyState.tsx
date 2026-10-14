import type { ReactNode } from 'react';

/** Estado vacío / sin datos. Nunca se rellena con contenido ficticio. */
export function EmptyState({ title, children, action, tone = 'neutral' }: { title: string; children?: ReactNode; action?: ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <div role="status" className={`card flex flex-col items-center gap-3 px-6 py-10 text-center ${tone === 'warning' ? 'border-warning/30' : ''}`}>
      <span aria-hidden className={`grid h-10 w-10 place-items-center rounded-full ${tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-gold/10 text-gold'}`}>
        {tone === 'warning' ? '!' : '◇'}
      </span>
      <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
      {children ? <div className="max-w-lg text-sm text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function DataUnavailable({ error }: { error?: string }) {
  return (
    <EmptyState title="Datos temporalmente no disponibles" tone="warning">
      <p>No pudimos obtener información actualizada{error ? ` (${error})` : ''}. No mostramos datos sustitutos: vuelve a intentarlo en unos minutos.</p>
    </EmptyState>
  );
}
