import Link from 'next/link';
import type { DataStatus } from '@/lib/api';
import { relativeAge } from '@/lib/format';

const STYLE = {
  DEMO: { dot: 'bg-warning', text: 'Modo demostración (datos ficticios)' },
  OK: { dot: 'bg-positive', text: 'Datos actualizados' },
  DEGRADED: { dot: 'bg-warning', text: 'Algunos datos con retraso' },
  NO_DATA_YET: { dot: 'bg-warning', text: 'Esperando primera sincronización' },
  NOT_CONFIGURED: { dot: 'bg-negative', text: 'Fuentes de datos sin configurar' },
} as const;

export function DataStatusIndicator({ status }: { status: DataStatus | null }) {
  const s = status ? STYLE[status.overall] : { dot: 'bg-muted', text: 'Estado no disponible' };
  const oddsAge = status?.lastOddsUpdate ? (Date.now() - Date.parse(status.lastOddsUpdate)) / 1000 : null;
  return (
    <Link href="/status" className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-foreground">
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.text}
      {oddsAge != null && <span className="hidden sm:inline">· cuotas {relativeAge(oddsAge)}</span>}
    </Link>
  );
}
