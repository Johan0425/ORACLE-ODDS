import { backoffDelay, CircuitBreaker, CircuitOpenError, TokenBucket } from '../../src/common/http/resilience';
import { ProviderHttpClient, ProviderHttpError, QuotaExceededError, type QuotaGate } from '../../src/common/http/provider-http-client';
import { recordedFetch } from '../helpers/recorded';

describe('backoff con jitter', () => {
  it('respeta el tope y crece exponencialmente', () => {
    expect(backoffDelay(0, { baseMs: 100, maxMs: 1000 }, () => 0.999)).toBeLessThan(100);
    expect(backoffDelay(3, { baseMs: 100, maxMs: 1000 }, () => 0.999)).toBe(799);
    expect(backoffDelay(10, { baseMs: 100, maxMs: 1000 }, () => 0.999)).toBe(999);
    expect(backoffDelay(5, { baseMs: 100, maxMs: 1000 }, () => 0)).toBe(0);
  });
});

describe('circuit breaker', () => {
  it('se abre tras N fallos, pasa a half-open tras el cooldown y se cierra con éxito', () => {
    let now = 0;
    const cb = new CircuitBreaker('p', 2, 1000, () => now);
    cb.onFailure();
    expect(cb.state).toBe('closed');
    cb.onFailure();
    expect(cb.state).toBe('open');
    expect(() => cb.assertCanRequest()).toThrow(CircuitOpenError);
    now = 1500;
    expect(cb.state).toBe('half_open');
    cb.assertCanRequest();
    expect(() => cb.assertCanRequest()).toThrow(CircuitOpenError);
    cb.onSuccess();
    expect(cb.state).toBe('closed');
  });
});

describe('token bucket', () => {
  it('limita la tasa y se recarga', () => {
    let now = 0;
    const b = new TokenBucket(2, 1 / 1000, () => now);
    expect(b.take()).toBe(0);
    expect(b.take()).toBe(0);
    expect(b.take()).toBeGreaterThan(0);
    now = 1000;
    expect(b.take()).toBe(0);
  });
});

describe('ProviderHttpClient', () => {
  const fast = () => 0;

  it('reintenta 5xx/429 y luego tiene éxito', async () => {
    const { fetch, calls } = recordedFetch([{ match: /x/, sequence: [{ status: 503 }, { status: 429, headers: { 'retry-after': '0' } }, { status: 200, body: { ok: true } }] }]);
    const c = new ProviderHttpClient({ provider: 'T', baseUrl: 'https://api.test', fetchImpl: fetch, random: fast, perMinute: 1000 });
    const r = await c.get<{ ok: boolean }>('x');
    expect(r.data.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('no reintenta errores de credenciales y no expone la clave', async () => {
    const { fetch, calls } = recordedFetch([{ match: /x/, status: 401, body: { message: 'bad key secret-123' } }]);
    const c = new ProviderHttpClient({ provider: 'T', baseUrl: 'https://api.test', query: { apiKey: 'secret-123' }, fetchImpl: fetch, random: fast });
    const err = await c.get('x').catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err.message).not.toContain('secret-123');
    expect(calls).toHaveLength(1);
  });

  it('agota reintentos y propaga el error', async () => {
    const { fetch, calls } = recordedFetch([{ match: /x/, status: 500 }]);
    const c = new ProviderHttpClient({ provider: 'T', baseUrl: 'https://api.test', fetchImpl: fetch, random: fast, maxRetries: 2, circuitFailureThreshold: 10 });
    await expect(c.get('x')).rejects.toBeInstanceOf(ProviderHttpError);
    expect(calls).toHaveLength(3);
  });

  it('consulta el cupo antes de llamar y registra el restante informado', async () => {
    const recordedCalls: Array<[string, number, number | null]> = [];
    const gate: QuotaGate = {
      reserve: async (_p, cost) => {
        if (cost > 5) throw new QuotaExceededError('T', 'test');
      },
      record: async (p, cost, rem) => void recordedCalls.push([p, cost, rem]),
    };
    const { fetch } = recordedFetch([{ match: /x/, body: [], headers: { 'x-remaining': '42' } }]);
    const c = new ProviderHttpClient({ provider: 'T', baseUrl: 'https://api.test', fetchImpl: fetch, quota: gate, remainingHeader: 'x-remaining' });
    await c.get('x', {}, 2);
    expect(recordedCalls).toEqual([['T', 2, 42]]);
    await expect(c.get('x', {}, 6)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('aplica timeout', async () => {
    const slow = (async (_u: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch;
    const c = new ProviderHttpClient({ provider: 'T', baseUrl: 'https://api.test', fetchImpl: slow, timeoutMs: 20, maxRetries: 0, random: fast });
    await expect(c.get('x')).rejects.toThrow(/timeout/);
  });
});
