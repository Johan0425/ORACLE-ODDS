'use client';

/** Acceso tolerante a fallos a localStorage (modo privado, almacenamiento bloqueado). */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface MyChallenge {
  code: string;
  title: string;
  secret: string;
  createdAt: string;
}
export const MY_CHALLENGES_KEY = 'oo_my_challenges';
export const participantKey = (code: string) => `oo_challenge_token_${code}`;
