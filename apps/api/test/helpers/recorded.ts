import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Ancla de fechas de test/fixtures/generate.js. */
export const RECORDING_ANCHOR = Date.parse('2026-10-14T12:00:00Z');
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

function rebase(value: unknown, delta: number, key?: string): unknown {
  if (typeof value === 'string' && ISO_RE.test(value)) return new Date(Date.parse(value) + delta).toISOString();
  if (typeof value === 'number' && key === 'timestamp') return value + Math.round(delta / 1000);
  if (Array.isArray(value)) return value.map((v) => rebase(v, delta));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebase(v, delta, k)]));
  return value;
}

/** Carga una respuesta grabada desplazando sus fechas para que sean relativas a `now`. */
export function recorded<T = unknown>(file: string, now = Date.now()): T {
  const raw = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', file), 'utf8'));
  return rebase(raw, now - RECORDING_ANCHOR) as T;
}

export interface Route {
  match: RegExp;
  file?: string;
  body?: unknown;
  status?: number;
  headers?: Record<string, string>;
  /** Respuestas sucesivas (para probar reintentos). */
  sequence?: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>;
}

/** `fetch` falso: resuelve cada URL contra rutas grabadas. Registra las URLs pedidas. */
export function recordedFetch(routes: Route[], now = Date.now()) {
  const calls: string[] = [];
  const counters = new Map<Route, number>();
  const impl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find((r) => r.match.test(url));
    if (!route) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    if (route.sequence) {
      const i = counters.get(route) ?? 0;
      counters.set(route, i + 1);
      const step = route.sequence[Math.min(i, route.sequence.length - 1)];
      return new Response(JSON.stringify(step.body ?? {}), { status: step.status, headers: { 'content-type': 'application/json', ...step.headers } });
    }
    const body = route.file ? recorded(route.file, now) : route.body;
    return new Response(JSON.stringify(body), { status: route.status ?? 200, headers: { 'content-type': 'application/json', ...route.headers } });
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}
