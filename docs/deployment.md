# Despliegue

| Componente | Plataforma recomendada | Notas |
|---|---|---|
| Frontend `apps/web` | Vercel | Root directory `apps/web`. Variables `NEXT_PUBLIC_API_URL`, `API_URL`, `NEXT_PUBLIC_SITE_URL`, `INTERNAL_API_TOKEN` |
| API `apps/api` | Render (servicio web Docker), Railway o Fly.io | `PROCESS_ROLE=api`; aplica migraciones al arrancar; healthcheck `/ready` |
| Worker | Render (servicio *worker* Docker) | `PROCESS_ROLE=worker`, `ENABLE_SYNC_WORKER=true`; nunca en Vercel Functions |
| PostgreSQL | Neon | `DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` directa (migraciones) |
| Redis | Upstash | `REDIS_URL=rediss://…` (TLS) |

## Pasos (Render + Neon + Upstash + Vercel)

1. **Neon**: crea el proyecto; copia la cadena *pooled* a `DATABASE_URL` y la directa a `DATABASE_URL_UNPOOLED`.
2. **Upstash**: crea una base Redis; copia la URL `rediss://` a `REDIS_URL`.
3. **Render**: *New → Blueprint* con `render.yaml`. Completa el grupo `oracle-odds-shared` (claves de proveedores, `TRACKED_LEAGUES`, `ODDS_SPORT_KEYS`, `ALLOWED_BOOKMAKERS`, `INTERNAL_API_TOKEN`) y en la API `CORS_ORIGIN` (dominio de Vercel) y `PUBLIC_WEB_URL`. `SYNC_ADMIN_SECRET`, `ANON_HASH_SALT` y `METRICS_TOKEN` se generan automáticamente.
4. **Vercel**: importa el repo con root `apps/web`. Define `NEXT_PUBLIC_API_URL=https://<api>.onrender.com/api/v1`, `API_URL` (igual), `NEXT_PUBLIC_SITE_URL`, `INTERNAL_API_TOKEN` (el mismo que la API).
5. Primer arranque: la API aplica migraciones. Ejecuta el catálogo e histórico:
   ```bash
   curl -X POST https://<api>/api/v1/admin/sync -H "x-admin-secret: $SYNC_ADMIN_SECRET" -H 'content-type: application/json' -d '{"job":"sync:sports-catalog"}'
   ```
   El worker programa el resto automáticamente (`sync:historical-fixtures` nocturno, `compute:model-metrics` diario).
6. Verifica `/ready`, `/api/v1/data-status` y la página `/status` del sitio.

## Docker local

```bash
docker compose up -d                          # Postgres + Redis
docker compose --profile app up -d --build    # + API (3001) y worker
docker build -f apps/api/Dockerfile -t oracle-odds-api .
```

## Modo "todo en Vercel" (despliegue actual)

Producción actual: web en el proyecto Vercel `oracle-odds` (https://web-chi-roan-84.vercel.app) y API en `oracle-odds-api` (https://oracle-odds-api.vercel.app, también `bet-predict.joanpe.dev`), con Postgres en Neon.

- **Sin worker ni BullMQ**: `QUEUE_MODE=inline`. Los jobs se ejecutan dentro de la función, disparados por `GET /api/v1/cron/{daily|odds|live|social}` con `Authorization: Bearer $CRON_SECRET`. Cada invocación respeta `CRON_TIME_BUDGET_MS` (240 s) y deja pendientes los jobs que no alcancen.
- **Vercel Cron** (`apps/api/vercel.json`) ejecuta `daily` a las 09:00 UTC (el plan Hobby solo admite una ejecución diaria).
- **Frecuentes** (`odds` y `live` cada 30 min): workflow `.github/workflows/scheduled-sync.yml`. Requiere los secretos de repositorio `ORACLE_API_URL` y `CRON_SECRET` y la variable `ENABLE_SCHEDULED_SYNC=true`. Para frecuencias de en vivo reales (15–60 s) usa el worker persistente (Render) o el plan Pro.
- **Migraciones**: el build de la API ejecuta `prisma migrate deploy` (usa `DATABASE_URL_UNPOOLED`).
- **Web**: Root Directory `apps/web`; `apps/web/vercel.json` instala y construye desde la raíz del monorepo (depende de `packages/probability-engine`).
- **Locks**: sin Redis en la API se usa un lock en memoria; los jobs son idempotentes, así que una ejecución concurrente no duplica datos.

Desplegar desde la raíz del repo:

```bash
vercel deploy --prod                                   # API (.vercel enlazado a oracle-odds-api)
VERCEL_ORG_ID=team_lQT3Dxc0NTj1iqlZIV9HgFaY VERCEL_PROJECT_ID=prj_jI87acn2xBo9JVFsdAXkclNyYvaP vercel deploy --prod   # web
```

## Despliegue serverless opcional de la API

`apps/api/api/index.ts` + `apps/api/vercel.json` permiten servir la API HTTP en Vercel Functions **sin worker** (el SSE de larga duración no está garantizado). El worker debe seguir en un proceso persistente.

## Variables obligatorias en producción

La validación de arranque falla si faltan: `DATABASE_URL`, `SYNC_ADMIN_SECRET` (≥ 24), `ANON_HASH_SALT` (≥ 16) y, para la API, `CORS_ORIGIN`. El worker exige Redis. Lista completa en `.env.example`.

## Backups

- Neon: activa *point-in-time restore* (retención ≥ 7 días) y crea una rama antes de cada migración relevante.
- Exportación lógica semanal: `pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f oracle-odds-$(date +%F).dump` a almacenamiento externo cifrado; prueba la restauración mensualmente.
- Redis no requiere backup (colas reconstruibles; los programadores se re-registran al arrancar el worker).
