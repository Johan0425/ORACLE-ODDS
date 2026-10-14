import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Hash estable de un objeto JSON (claves ordenadas). */
export function stableHash(value: unknown): string {
  return sha256(stableStringify(value));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Secreto aleatorio URL-safe (para creatorSecret y tokens anónimos). */
export function randomSecret(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código público corto sin caracteres ambiguos (0/O, 1/I). */
export function publicCode(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function hashSecret(secret: string): string {
  return sha256(`oracle-odds:${secret}`);
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = Buffer.from(sha256(a), 'hex');
  const hb = Buffer.from(sha256(b), 'hex');
  return timingSafeEqual(ha, hb);
}

/**
 * Hash de sesión anónima con sal rotada diariamente: el mismo visitante produce
 * el mismo hash solo durante un día, y la IP nunca se almacena en claro.
 */
export function dailyAnonymousHash(parts: Array<string | undefined>, salt: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return createHmac('sha256', `${salt}:${day}`).update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 32);
}
