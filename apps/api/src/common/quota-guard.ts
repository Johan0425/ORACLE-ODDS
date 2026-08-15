export type DataProviderKey = 'API_FOOTBALL' | 'THE_ODDS_API' | 'THESPORTSDB' | 'SPORTS_GAME_ODDS';

export interface QuotaUsage {
  used: number;
  limit: number;
}

/** Puerto sobre `ProviderQuotaUsage` (Postgres) — implementado por el módulo `sync` con Prisma. */
export interface QuotaStore {
  getUsage(provider: DataProviderKey, date: string): Promise<QuotaUsage>;
  increment(provider: DataProviderKey, date: string, cost: number): Promise<void>;
}

export class QuotaExceededError extends Error {
  constructor(provider: DataProviderKey, usage: QuotaUsage) {
    super(`${provider} sin cupo disponible: ${usage.used}/${usage.limit} hoy`);
    this.name = 'QuotaExceededError';
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Envuelve cualquier llamada a un adapter externo: verifica cupo antes de gastarlo
 * y solo incrementa el contador si la llamada tuvo éxito. Si no hay cupo, lanza
 * `QuotaExceededError` en vez de golpear la API — el job que la invoque decide si
 * reintenta al día siguiente o sirve datos cacheados (degradación elegante).
 */
export async function withQuota<T>(
  store: QuotaStore,
  provider: DataProviderKey,
  cost: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const date = todayKey();
  const usage = await store.getUsage(provider, date);

  if (usage.used + cost > usage.limit) {
    throw new QuotaExceededError(provider, usage);
  }

  const result = await fetchFn();
  await store.increment(provider, date, cost);
  return result;
}
