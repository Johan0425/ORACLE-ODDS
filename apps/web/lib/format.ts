import { MARKET_DEFINITIONS, SELECTION_LABELS_ES, isMarketKey } from '@oracle-odds/probability-engine';

export const TIMEZONE = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? 'America/Bogota';
export const LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'es-CO';

export function formatKickoff(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: TIMEZONE }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE }).format(new Date(iso));
}

export function pct(p: number | null | undefined, digits = 1): string {
  return p == null || Number.isNaN(p) ? '—' : `${(p * 100).toFixed(digits)}%`;
}

export function signedPct(p: number | null | undefined, digits = 1): string {
  if (p == null || Number.isNaN(p)) return '—';
  const v = (p * 100).toFixed(digits);
  return p > 0 ? `+${v}%` : `${v}%`;
}

/** Edge en puntos porcentuales (p.p.). */
export function points(p: number | null | undefined, digits = 1): string {
  if (p == null) return '—';
  const v = (p * 100).toFixed(digits);
  return `${p > 0 ? '+' : ''}${v} p.p.`;
}

export function odds(o: number | null | undefined): string {
  return o == null ? '—' : o.toFixed(2);
}

export function units(u: number | null | undefined): string {
  if (u == null) return '—';
  return `${u > 0 ? '+' : ''}${u.toFixed(2)} u`;
}

/** "hace 12 s", "hace 5 min", "hace 2 h". */
export function relativeAge(seconds: number | null | undefined): string {
  if (seconds == null) return 'sin dato';
  if (seconds < 60) return `hace ${Math.max(0, Math.round(seconds))} s`;
  if (seconds < 3600) return `hace ${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `hace ${Math.round(seconds / 3600)} h`;
  return `hace ${Math.round(seconds / 86_400)} d`;
}

export function ageSince(iso: string | null | undefined, now = Date.now()): number | null {
  return iso ? (now - Date.parse(iso)) / 1000 : null;
}

export function marketName(key: string): string {
  return isMarketKey(key) ? MARKET_DEFINITIONS[key].displayName : key;
}

export function selectionName(marketKey: string, selectionKey: string, line: number | null, home: string, away: string): string {
  if (selectionKey === 'HOME') return line != null && marketKey !== '1X2' ? `${home} ${line > 0 ? '+' : ''}${line}` : home;
  if (selectionKey === 'AWAY') return line != null && marketKey !== '1X2' ? `${away} ${-line > 0 ? '+' : ''}${-line}` : away;
  if (selectionKey === 'OVER' || selectionKey === 'UNDER') return `${SELECTION_LABELS_ES[selectionKey]} ${line}`;
  if (selectionKey === 'HOME_DRAW') return `${home} o empate`;
  if (selectionKey === 'DRAW_AWAY') return `Empate o ${away}`;
  if (selectionKey === 'HOME_AWAY') return `${home} o ${away}`;
  if (marketKey === 'EH') return `${SELECTION_LABELS_ES[selectionKey] ?? selectionKey} (${line != null && line > 0 ? '+' : ''}${line})`;
  return SELECTION_LABELS_ES[selectionKey] ?? selectionKey;
}

export const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Programado',
  LIVE: 'En vivo',
  FINISHED: 'Finalizado',
  POSTPONED: 'Aplazado',
  CANCELLED: 'Cancelado',
  SUSPENDED: 'Suspendido',
  ABANDONED: 'Abandonado',
};

export const RESULT_LABEL: Record<string, string> = {
  WIN: 'Ganada',
  LOSS: 'Perdida',
  PUSH: 'Push',
  HALF_WIN: 'Media ganada',
  HALF_LOSS: 'Media perdida',
  VOID: 'Anulada',
};
