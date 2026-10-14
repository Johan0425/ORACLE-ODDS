import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Registro Prometheus del proceso. Expuesto en GET /metrics (protegido con METRICS_TOKEN si se define). */
export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'oracle_' });

export const providerRequests = new Counter({
  name: 'oracle_provider_requests_total',
  help: 'Llamadas a proveedores externos',
  labelNames: ['provider', 'endpoint', 'outcome'] as const,
  registers: [metricsRegistry],
});

export const providerLatency = new Histogram({
  name: 'oracle_provider_request_duration_seconds',
  help: 'Latencia de proveedores externos',
  labelNames: ['provider', 'endpoint'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
  registers: [metricsRegistry],
});

export const providerQuotaRemaining = new Gauge({
  name: 'oracle_provider_quota_remaining',
  help: 'Cupo restante informado por el proveedor o calculado localmente',
  labelNames: ['provider'] as const,
  registers: [metricsRegistry],
});

export const circuitState = new Gauge({
  name: 'oracle_provider_circuit_open',
  help: '1 si el circuit breaker del proveedor está abierto',
  labelNames: ['provider'] as const,
  registers: [metricsRegistry],
});

export const jobRuns = new Counter({
  name: 'oracle_job_runs_total',
  help: 'Ejecuciones de jobs de sincronización/cómputo',
  labelNames: ['job', 'status'] as const,
  registers: [metricsRegistry],
});

export const jobDuration = new Histogram({
  name: 'oracle_job_duration_seconds',
  help: 'Duración de jobs',
  labelNames: ['job'] as const,
  buckets: [0.5, 1, 5, 15, 30, 60, 180, 600],
  registers: [metricsRegistry],
});

export const entitiesNormalized = new Counter({
  name: 'oracle_entities_normalized_total',
  help: 'Entidades normalizadas por tipo y acción',
  labelNames: ['entity', 'action'] as const,
  registers: [metricsRegistry],
});

export const dataFreshnessSeconds = new Gauge({
  name: 'oracle_data_freshness_seconds',
  help: 'Segundos desde la última sincronización exitosa por proveedor y job',
  labelNames: ['provider', 'job'] as const,
  registers: [metricsRegistry],
});

export const valueBetsGauge = new Gauge({
  name: 'oracle_value_bets_active',
  help: 'Oportunidades activas publicadas',
  registers: [metricsRegistry],
});

export const settlementsCounter = new Counter({
  name: 'oracle_settlements_total',
  help: 'Selecciones liquidadas',
  labelNames: ['kind', 'result'] as const,
  registers: [metricsRegistry],
});

export const affiliateClicksCounter = new Counter({
  name: 'oracle_affiliate_clicks_total',
  help: 'Clics a enlaces de afiliado',
  labelNames: ['bookmaker', 'placement'] as const,
  registers: [metricsRegistry],
});

export const httpRequests = new Histogram({
  name: 'oracle_http_request_duration_seconds',
  help: 'Duración de peticiones HTTP de la API',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const modelQuality = new Gauge({
  name: 'oracle_model_quality',
  help: 'Calidad del modelo por mercado y fuente (brier, log_loss, ece)',
  labelNames: ['market', 'source', 'metric'] as const,
  registers: [metricsRegistry],
});

export const bettingPerformance = new Gauge({
  name: 'oracle_betting_performance',
  help: 'Rendimiento de oportunidades liquidadas (roi, clv, max_drawdown, bets)',
  labelNames: ['metric'] as const,
  registers: [metricsRegistry],
});
