'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useBetSlip } from '@/lib/betslip-store';

export const NAV = [
  { href: '/matches', label: 'Partidos' },
  { href: '/live', label: 'En vivo' },
  { href: '/best-bets', label: 'Oportunidades' },
  { href: '/odds-comparison', label: 'Comparador' },
  { href: '/builder', label: 'Combinadas' },
  { href: '/challenges', label: 'Retos' },
  { href: '/track-record', label: 'Historial' },
  { href: '/methodology', label: 'Metodología' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const legs = useBetSlip((s) => s.legs.length);
  const setSlipOpen = useBetSlip((s) => s.setOpen);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-gold focus:px-3 focus:py-1 focus:text-background">
        Saltar al contenido
      </a>
      <nav aria-label="Principal" className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.3em] text-foreground">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-gold text-background">◆</span>
          <span>Oracle Odds</span>
        </Link>
        <ul className="hidden items-center gap-5 lg:flex">
          {NAV.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(`${l.href}/`);
            return (
              <li key={l.href}>
                <Link href={l.href} aria-current={active ? 'page' : undefined} className={`text-sm transition-colors ${active ? 'text-gold' : 'text-muted hover:text-foreground'}`}>
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSlipOpen(true)} className="btn-ghost px-3" aria-label={`Abrir Bet Slip (${hydrated ? legs : 0} selecciones)`} data-testid="slip-toggle">
            Slip
            <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-xs font-bold text-background">{hydrated ? legs : 0}</span>
          </button>
          <button type="button" className="btn-ghost px-3 lg:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
            <span aria-hidden>{open ? '✕' : '☰'}</span>
            <span className="sr-only">Menú</span>
          </button>
        </div>
      </nav>
      {open && (
        <ul id="mobile-nav" className="grid gap-1 border-t border-line px-4 py-3 lg:hidden">
          {NAV.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="block rounded-lg px-3 py-2 text-sm text-foreground hover:bg-surface-2">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
