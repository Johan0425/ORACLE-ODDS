import { z } from 'zod';

const responseSchema = z.object({ success: z.boolean() });

/** Verificación de Cloudflare Turnstile (server-side). Sin secreto configurado no se puede verificar → false. */
export async function verifyTurnstile(secret: string | undefined, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!res?.ok) return false;
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success && parsed.data.success;
}
