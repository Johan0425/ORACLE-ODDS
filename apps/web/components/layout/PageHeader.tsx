import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-sm text-muted">{children}</div>}
      </div>
      {actions}
    </header>
  );
}

export function Section({ title, children, action, id }: { title: string; children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 id={id} className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
