/** Primitivas de resiliencia sin dependencias externas: backoff con jitter, circuit breaker y token bucket. */

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
}

/** Exponential backoff con "full jitter" (AWS Architecture Blog): aleatorio en [0, min(max, base·2^n)]. */
export function backoffDelay(attempt: number, opts: BackoffOptions, random: () => number = Math.random): number {
  const cap = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt);
  return Math.floor(random() * cap);
}

export type CircuitStateName = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  constructor(public readonly provider: string, public readonly retryAt: Date) {
    super(`Circuito abierto para ${provider} hasta ${retryAt.toISOString()}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker clásico: tras `failureThreshold` fallos consecutivos se abre
 * durante `cooldownMs`; luego deja pasar una prueba (half-open) y se cierra si
 * tiene éxito.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private halfOpenInFlight = false;

  constructor(
    public readonly name: string,
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): CircuitStateName {
    if (this.openedAt == null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half_open' : 'open';
  }

  assertCanRequest(): void {
    const s = this.state;
    if (s === 'open') throw new CircuitOpenError(this.name, new Date((this.openedAt ?? 0) + this.cooldownMs));
    if (s === 'half_open') {
      if (this.halfOpenInFlight) throw new CircuitOpenError(this.name, new Date(this.now() + 1000));
      this.halfOpenInFlight = true;
    }
  }

  onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenInFlight = false;
  }

  onFailure(): void {
    this.halfOpenInFlight = false;
    this.failures += 1;
    if (this.failures >= this.failureThreshold || this.openedAt != null) this.openedAt = this.now();
  }
}

/** Token bucket por proceso para respetar límites por minuto del proveedor. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.lastRefill) * this.refillPerMs);
    this.lastRefill = t;
  }

  /** Milisegundos a esperar antes de poder consumir `cost` tokens (0 = disponible ya, y los consume). */
  take(cost = 1): number {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return 0;
    }
    return Math.ceil((cost - this.tokens) / this.refillPerMs);
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
