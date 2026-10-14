import { appLogger, redact } from '../logger';
import { correlationId } from '../request-context';
import { circuitState, providerLatency, providerQuotaRemaining, providerRequests } from '../metrics';
import { backoffDelay, CircuitBreaker, sleep, TokenBucket } from './resilience';

export class ProviderHttpError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export class QuotaExceededError extends Error {
  constructor(public readonly provider: string, detail: string) {
    super(`${provider}: cupo agotado (${detail})`);
    this.name = 'QuotaExceededError';
  }
}

export interface QuotaGate {
  /** Lanza QuotaExceededError si consumir `cost` excedería el presupuesto. */
  reserve(provider: string, cost: number): Promise<void>;
  /** Registra el consumo real y el restante informado por el proveedor (si existe). */
  record(provider: string, cost: number, reportedRemaining: number | null): Promise<void>;
}

export interface ProviderHttpOptions {
  provider: string;
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  perMinute?: number;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  headers?: Record<string, string>;
  /** Parámetros de query añadidos a cada llamada (p. ej. apiKey). Nunca se registran en logs. */
  query?: Record<string, string>;
  /** Cabecera de la que leer el cupo restante. */
  remainingHeader?: string;
  quota?: QuotaGate;
  fetchImpl?: typeof fetch;
  random?: () => number;
}

export interface HttpResult<T> {
  data: T;
  status: number;
  headers: Headers;
  providerRequestId: string | null;
  durationMs: number;
}

/**
 * Cliente HTTP para proveedores con timeout, reintentos con backoff+jitter,
 * respeto de Retry-After, token bucket, circuit breaker, control de cupo y
 * métricas. Las URLs se registran redactadas.
 */
export class ProviderHttpClient {
  private readonly breaker: CircuitBreaker;
  private readonly bucket: TokenBucket;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ProviderHttpOptions) {
    this.breaker = new CircuitBreaker(opts.provider, opts.circuitFailureThreshold ?? 5, opts.circuitCooldownMs ?? 60_000);
    const perMinute = opts.perMinute ?? 30;
    this.bucket = new TokenBucket(Math.max(1, Math.min(perMinute, 10)), perMinute / 60_000);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get circuit() {
    return this.breaker.state;
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}, cost = 1): Promise<HttpResult<T>> {
    const endpoint = path.split('?')[0];
    const url = new URL(path.replace(/^\//, ''), this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`);
    for (const [k, v] of Object.entries({ ...this.opts.query, ...params })) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));

    const maxRetries = this.opts.maxRetries ?? 3;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.breaker.assertCanRequest();
      circuitState.set({ provider: this.opts.provider }, this.breaker.state === 'closed' ? 0 : 1);
      if (this.opts.quota) await this.opts.quota.reserve(this.opts.provider, cost);
      const wait = this.bucket.take();
      if (wait > 0) await sleep(wait);

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 15_000);
      try {
        const res = await this.fetchImpl(url, {
          headers: { accept: 'application/json', 'x-correlation-id': correlationId() ?? '', ...this.opts.headers },
          signal: controller.signal,
        });
        const durationMs = Date.now() - started;
        providerLatency.observe({ provider: this.opts.provider, endpoint }, durationMs / 1000);
        const remainingRaw = this.opts.remainingHeader ? res.headers.get(this.opts.remainingHeader) : null;
        const remaining = remainingRaw != null && remainingRaw !== '' ? Number(remainingRaw) : null;
        if (remaining != null && Number.isFinite(remaining)) providerQuotaRemaining.set({ provider: this.opts.provider }, remaining);

        if (res.ok) {
          const data = (await res.json()) as T;
          this.breaker.onSuccess();
          providerRequests.inc({ provider: this.opts.provider, endpoint, outcome: 'success' });
          if (this.opts.quota) await this.opts.quota.record(this.opts.provider, cost, Number.isFinite(remaining) ? remaining : null);
          return {
            data,
            status: res.status,
            headers: res.headers,
            providerRequestId: res.headers.get('x-request-id') ?? res.headers.get('cf-ray'),
            durationMs,
          };
        }

        const retryable = res.status === 429 || res.status >= 500;
        // Las respuestas de error no se incluyen completas: pueden contener datos del plan o eco de la clave.
        const message = `${this.opts.provider} ${endpoint} respondió ${res.status}`;
        providerRequests.inc({ provider: this.opts.provider, endpoint, outcome: `http_${res.status}` });
        if (res.status === 401 || res.status === 403) {
          this.breaker.onFailure();
          throw new ProviderHttpError(this.opts.provider, res.status, `${message} (credenciales o plan sin acceso)`, false);
        }
        if (!retryable) throw new ProviderHttpError(this.opts.provider, res.status, message, false);
        this.breaker.onFailure();
        lastError = new ProviderHttpError(this.opts.provider, res.status, message, true);
        const retryAfter = Number(res.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffDelay(attempt, { baseMs: 500, maxMs: 15_000 }, this.opts.random);
        appLogger.event('warn', 'Reintento de proveedor', { provider: this.opts.provider, endpoint, status: res.status, attempt, delayMs: delay });
        if (attempt < maxRetries) await sleep(delay);
      } catch (error) {
        if (error instanceof ProviderHttpError && !error.retryable) throw error;
        if (error instanceof ProviderHttpError) {
          lastError = error;
          continue;
        }
        this.breaker.onFailure();
        const aborted = (error as Error).name === 'AbortError';
        providerRequests.inc({ provider: this.opts.provider, endpoint, outcome: aborted ? 'timeout' : 'network_error' });
        lastError = new ProviderHttpError(this.opts.provider, 0, `${this.opts.provider} ${endpoint}: ${aborted ? 'timeout' : redact((error as Error).message)}`, true);
        if (attempt < maxRetries) await sleep(backoffDelay(attempt, { baseMs: 500, maxMs: 15_000 }, this.opts.random));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${this.opts.provider}: fallo desconocido`);
  }
}
