import { stripAccents } from '../normalization/names';

/** Lista corta de términos bloqueados (ES/EN). Se amplía sin tocar código vía CHALLENGE_BLOCKLIST. */
const BASE_BLOCKLIST = [
  'puta', 'puto', 'mierda', 'gonorrea', 'malparido', 'hijueputa', 'marica', 'pendejo', 'culero', 'verga',
  'fuck', 'shit', 'bitch', 'nigger', 'faggot', 'cunt', 'nazi', 'hitler',
];

/** Mensajes que contradicen el producto: dinero real, premios monetarios, garantías. */
const MONEY_PATTERNS = [/premio[s]?\s+(en\s+)?(dinero|efectivo|\$)/i, /\$\s?\d/, /\bcop\b|\busd\b/i, /dep[oó]sit/i, /apuesta\s+real/i, /garantizad/i, /segur[oa]\s+gan/i];

const URL_PATTERN = /(https?:\/\/|www\.|\.[a-z]{2,4}\/)/i;

function normalized(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's');
}

export function containsBlockedTerm(text: string, extra: string[] = []): boolean {
  const n = normalized(text);
  return [...BASE_BLOCKLIST, ...extra].some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(n));
}

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

export function moderateAlias(alias: string, extra: string[] = []): ModerationResult {
  const a = alias.trim();
  if (!/^[\p{L}\p{N}_ .-]{3,20}$/u.test(a)) return { ok: false, reason: 'El alias debe tener 3-20 caracteres (letras, números, espacio, _ . -)' };
  if (containsBlockedTerm(a, extra)) return { ok: false, reason: 'Alias no permitido' };
  if (/\d{7,}/.test(a)) return { ok: false, reason: 'El alias no puede contener datos de contacto' };
  return { ok: true };
}

export function moderateText(text: string, extra: string[] = []): ModerationResult {
  if (URL_PATTERN.test(text)) return { ok: false, reason: 'No se permiten enlaces' };
  if (containsBlockedTerm(text, extra)) return { ok: false, reason: 'Contenido no permitido' };
  if (MONEY_PATTERNS.some((re) => re.test(text))) return { ok: false, reason: 'Los retos no admiten dinero real, premios monetarios ni promesas de ganancia' };
  return { ok: true };
}

/** Elimina etiquetas y caracteres de control (defensa en profundidad; el frontend además escapa). */
export function sanitizePlainText(text: string, max: number): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
