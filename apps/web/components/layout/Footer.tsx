import Link from 'next/link';
import { COMPLIANCE } from '@/lib/compliance';

const LINKS = [
  { href: '/responsible-gambling', label: 'Juego responsable' },
  { href: '/methodology', label: 'Metodología' },
  { href: '/track-record', label: 'Rendimiento histórico' },
  { href: '/status', label: 'Estado de los datos' },
  { href: '/terms', label: 'Términos de uso' },
  { href: '/privacy', label: 'Privacidad' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/disclaimer', label: 'Descargo de responsabilidad' },
  { href: '/sponsor/betsantander', label: 'Patrocinio y afiliación' },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3">
        <div>
          <p className="font-display text-sm font-bold uppercase tracking-[0.3em]">Oracle Odds</p>
          <p className="mt-3 text-sm text-muted">{COMPLIANCE.disclaimer}</p>
          <p className="mt-2 text-sm text-muted">{COMPLIANCE.notOperator}</p>
        </div>
        <nav aria-label="Legal y ayuda">
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-3 text-sm text-muted">
          <p className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/40 font-display text-xs font-bold text-gold">18+</span>
            {COMPLIANCE.addiction}
          </p>
          <p>{COMPLIANCE.affiliateDisclosure}</p>
          <p>{COMPLIANCE.oddsChange}</p>
        </div>
      </div>
      <p className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getFullYear()} ORACLE ODDS · Herramienta informativa y estadística</p>
    </footer>
  );
}
