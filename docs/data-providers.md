# Proveedores de datos

Ningún proveedor es obligatorio para arrancar: sin claves la plataforma muestra un estado honesto ("fuentes sin configurar"). Nunca se rellenan datos ausentes.

| Proveedor | Variable | Uso | Rol |
|---|---|---|---|
| API-Football (api-sports.io) | `API_FOOTBALL_KEY` | Ligas, temporadas, equipos, partidos históricos/próximos/en vivo, resultados, clasificaciones, estadísticas, eventos, alineaciones, lesiones; cuotas prepartido opcionales (`ENABLE_API_FOOTBALL_ODDS`) | Fuente autoritativa de partidos y marcadores |
| The Odds API | `THE_ODDS_API_KEY` | Cuotas de varias casas por región (`h2h`, `spreads`, `totals`), resultados, histórico (`ENABLE_HISTORICAL_ODDS`, plan pago) | Fuente principal de cuotas |
| odds-api.io | `ODDS_API_IO_KEY` + `ENABLE_ODDS_API_IO=true` | Cobertura adicional de casas (`/events`, `/odds/multi`) | Opcional, detrás de feature flag |
| TheSportsDB | `THESPORTSDB_KEY` | Escudos y estadio cuando faltan | Solo metadatos, nunca cuotas ni estadísticas |

## Cómo obtener las claves

- **API-Football**: registro en dashboard.api-football.com. El plan gratuito permite ~100 req/día y temporadas limitadas; configura `API_FOOTBALL_DAILY_LIMIT` y `API_FOOTBALL_PER_MINUTE` según tu plan. Elige ligas en `TRACKED_LEAGUES` (IDs de API-Football, p. ej. 39 Premier League, 140 LaLiga, 135 Serie A, 78 Bundesliga, 61 Ligue 1, 2 Champions League; verifica el ID de cada liga en `/leagues`).
- **The Odds API**: registro en the-odds-api.com. El plan gratuito da 500 créditos/mes; **cada llamada a `/odds` cuesta mercados × regiones** (3 × 2 = 6 por defecto). Configura `THE_ODDS_API_MONTHLY_LIMIT`, `ODDS_SPORT_KEYS` (p. ej. `soccer_epl,soccer_spain_la_liga`) y, sobre todo, `ALLOWED_BOOKMAKERS`.
- **odds-api.io**: docs.odds-api.io. Requiere `ODDS_API_IO_COMPETITIONS` con formato `deporte:liga` y `ALLOWED_BOOKMAKERS` (el endpoint exige la lista de casas). El mapeo sigue el formato documentado (`ML`, `Spread`, `Totals`, `Both Teams To Score`, `Draw No Bet`); el streaming por WebSocket no está habilitado: se usa polling.
- **TheSportsDB**: `3` es la clave pública de prueba; para producción usa una clave Patreon.

## Límites y cupo

- `QuotaService` lleva el consumo diario por proveedor en `provider_quota_usage` (compartido entre réplicas) y respeta el restante que informan las cabeceras (`x-ratelimit-requests-remaining`, `x-requests-remaining`). Si no hay cupo, el job falla con `QuotaExceededError` y queda registrado.
- `sync:live-odds` no consume cupo si no hay partidos en vivo.
- `sync:fixture-details`, `sync:lineups` y `sync:injuries` procesan como máximo 25 partidos por ejecución.
- Con los planes gratuitos, ajusta frecuencias (`SYNC_PREMATCH_ODDS_EVERY_MS`, etc.) para no agotar el cupo: ver `operations-runbook.md`.

## Casas autorizadas

Solo se muestran casas cuyo slug está en `ALLOWED_BOOKMAKERS`. Esa lista debe reflejar **operadores verificados como autorizados por Coljuegos** (o el regulador del territorio). La plataforma no decide la autorización: la configura el responsable legal.

## Pruebas con respuestas grabadas

`apps/api/test/fixtures/` contiene respuestas con el formato exacto de cada proveedor, generadas por `test/fixtures/generate.js` con equipos ficticios. Solo se usan en pruebas (unitarias, integración y E2E) y nunca se cargan fuera de bases de prueba.
