# Runbook de operación

## Salud

| Comprobación | Dónde |
|---|---|
| Proceso vivo | `GET /health` (API) · `GET :WORKER_HEALTH_PORT/health` (worker) |
| Dependencias | `GET /ready` (DB y Redis) |
| Frescura pública | `GET /api/v1/data-status` · página `/status` |
| Métricas | `GET /metrics` (API) y `/metrics` del worker, con `Authorization: Bearer $METRICS_TOKEN` |
| Corridas | `GET /api/v1/admin/sync-runs`, `GET /api/v1/admin/queues` (con `x-admin-secret`) |

Alertas en `ops/prometheus/alerts.yml`; dashboard en `ops/grafana/oracle-odds-dashboard.json`.

## Ejecutar un job a mano

```bash
# Encolar (requiere Redis y worker):
curl -X POST $API/api/v1/admin/sync -H "x-admin-secret: $SYNC_ADMIN_SECRET" -H 'content-type: application/json' -d '{"job":"sync:prematch-odds"}'
# En línea (espera el resultado):
curl ... -d '{"job":"compute:predictions","inline":true}'
# Sin Redis, en un contenedor o local:
npm run job -w apps/api -- sync:upcoming-fixtures compute:predictions
docker run --rm -e PROCESS_ROLE=job ... oracle-odds-api sync:results
```

Jobs: `sync:sports-catalog`, `sync:leagues`, `sync:teams`, `sync:historical-fixtures`, `sync:upcoming-fixtures`, `sync:live-fixtures`, `sync:fixture-details`, `sync:lineups`, `sync:injuries`, `sync:prematch-odds`, `sync:live-odds`, `sync:results`, `sync:settlements`, `compute:predictions`, `compute:value-bets`, `compute:model-metrics`, `export:social-card`.

## Incidencias

**Datos vencidos (`/status` en "Vencido")** — revisa `lastError` del job. `QuotaExceededError`: espera al reinicio diario o reduce frecuencias. `401/403`: clave inválida o plan sin acceso al endpoint. Circuito abierto: el proveedor falló 5 veces seguidas; se reintenta solo tras 60 s.

**Worker detenido (alerta `WorkerStopped`)** — reinicia el servicio. Los programadores se re-registran al arrancar. Revisa la cola `oracle-dead-letter` en `admin/queues` y reencola los jobs necesarios.

**Sin oportunidades publicadas** — es normal si ningún mercado supera la validación (`/methodology#metricas`) o los umbrales `VALUE_MIN_*`. No bajes `PUBLISH_REQUIRE_CALIBRATION` en producción.

**Partido duplicado** — localiza ambos IDs; si uno vino de The Odds API y otro de API-Football, añade la correspondencia en `ODDS_KEY_TO_API_FOOTBALL_LEAGUE` o ajusta `FIXTURE_MATCH_TOLERANCE_MINUTES`. La resolución nunca fusiona casos ambiguos a propósito.

**Cuotas de una casa no aparecen** — confirma que su slug está en `ALLOWED_BOOKMAKERS` (se normaliza: `casa_uno` → `casa-uno`).

## Cupo con planes gratuitos

The Odds API gratis = 500 créditos/mes ≈ 16/día. Con 3 mercados × 2 regiones cada llamada cuesta 6: usa una sola región (`ODDS_REGIONS=eu`), 1–2 `ODDS_SPORT_KEYS` y `SYNC_PREMATCH_ODDS_EVERY_MS` ≥ 3 h, o un plan de pago. API-Football gratis = 100/día: limita `TRACKED_LEAGUES` y deja los detalles por partido (25 por corrida) para las ligas principales.

## Rotación de secretos

1. Genera el nuevo valor (`openssl rand -base64 36`).
2. `SYNC_ADMIN_SECRET`, `METRICS_TOKEN`: actualiza en la plataforma y reinicia; los consumidores usan el nuevo.
3. `INTERNAL_API_TOKEN`: actualízalo a la vez en API y Vercel (durante el cambio el SSR queda sujeto al límite por IP, no se cae).
4. `ANON_HASH_SALT`: rotarlo invalida la continuidad de hashes del día (aceptable).
5. Claves de proveedores: crea la nueva en el panel del proveedor, actualiza y revoca la anterior.

## Datos legados

`npm run data:purge-unverified -w apps/api` (simulación) y `-- --confirm` para eliminar partidos sin procedencia de la versión anterior. Haz backup antes.

## Retención

- `sync_run_logs`: purga mensual de registros > 90 días.
- `affiliate_clicks`: 13 meses. Logs de aplicación: 30 días.
- Retos: archivados automáticamente 30 días después de cerrar.
