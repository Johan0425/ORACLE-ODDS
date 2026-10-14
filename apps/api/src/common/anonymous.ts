import type { Request } from 'express';
import { dailyAnonymousHash } from './hashing';
import type { AppEnv } from '../config/env';

/**
 * Identificador anónimo diario para rate limiting y antiabuso. Se deriva de IP
 * + user-agent con una sal rotada por día; la IP nunca se guarda en claro.
 */
export function anonymousSessionHash(req: Request, env: Pick<AppEnv, 'ANON_HASH_SALT'>): string {
  const ip = req.ip ?? req.socket?.remoteAddress ?? '';
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 200);
  return dailyAnonymousHash([ip, ua], env.ANON_HASH_SALT ?? 'dev-only-salt');
}
