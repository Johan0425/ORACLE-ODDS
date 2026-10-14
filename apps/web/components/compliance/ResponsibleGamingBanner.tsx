import Link from 'next/link';
import { COMPLIANCE } from '@/lib/compliance';

export function ResponsibleGamingBanner({ variant = 'bar' }: { variant?: 'bar' | 'card' }) {
  if (variant === 'card') {
    return (
      <aside aria-label="Juego responsable" className="card flex flex-col gap-3 border-gold/20 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold/40 font-display text-sm font-bold text-gold">18+</span>
          <p className="text-sm text-muted">
            <strong className="text-foreground">Juega con responsabilidad.</strong> {COMPLIANCE.addiction} Fija límites de tiempo y dinero y nunca intentes recuperar pérdidas.
          </p>
        </div>
        <Link href="/responsible-gambling" className="btn-ghost shrink-0">
          Ayuda y límites
        </Link>
      </aside>
    );
  }
  return (
    <div className="border-b border-line bg-surface/80 text-center text-[11px] leading-6 text-muted">
      <span className="font-semibold text-gold">18+</span> · {COMPLIANCE.addiction}{' '}
      <Link href="/responsible-gambling" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
        Juego responsable
      </Link>
    </div>
  );
}
