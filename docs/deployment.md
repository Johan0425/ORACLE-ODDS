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

## Despliegue serverless opcional de la API

`apps/api/api/index.ts` + `apps/api/vercel.json` permiten servir la API HTTP en Vercel Functions **sin worker** (el SSE de larga duración no está garantizado). El worker debe seguir en un proceso persistente.

## Variables obligatorias en producción

La validación de arranque falla si faltan: `DATABASE_URL`, `SYNC_ADMIN_SECRET` (≥ 24), `ANON_HASH_SALT` (≥ 16) y, para la API, `CORS_ORIGIN`. El worker exige Redis. Lista completa en `.env.example`.

## Backups

- Neon: activa *point-in-time restore* (retención ≥ 7 días) y crea una rama antes de cada migración relevante.
- Exportación lógica semanal: `pg_dump "$DATABASE_URL_UNPOOLED" -Fc -f oracle-odds-$(date +%F).dump` a almacenamiento externo cifrado; prueba la restauración mensualmente.
- Redis no requiere backup (colas reconstruibles; los programadores se re-registran al arrancar el worker).
