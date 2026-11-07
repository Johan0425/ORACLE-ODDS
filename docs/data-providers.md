# Proveedores de datos

Ningún proveedor es obligatorio para arrancar: sin claves la plataforma muestra un estado honesto ("fuentes sin configurar"). Nunca se rellenan datos ausentes.

| Proveedor | Variable | Uso | Rol |
|---|---|---|---|
| ESPN (endpoints públicos) | `ENABLE_ESPN` (true por defecto), `ESPN_LEAGUES` | Calendario por año/mes, resultados, marcador en vivo, clasificación, escudos y cuotas de una casa de referencia (DraftKings) | Fuente gratuita principal; sin clave ni cupo publicado |
| API-Football (api-sports.io) | `API_FOOTBALL_KEY` | Ligas, temporadas, equipos, partidos históricos/próximos/en vivo, resultados, clasificaciones, estadísticas, eventos, alineaciones, lesiones; cuotas prepartido opcionales (`ENABLE_API_FOOTBALL_ODDS`) | Fuente autoritativa de partidos y marcadores |
| The Odds API | `THE_ODDS_API_KEY` | Cuotas de varias casas por región (`h2h`, `spreads`, `totals`), resultados, histórico (`ENABLE_HISTORICAL_ODDS`, plan pago) | Fuente principal de cuotas |
| odds-api.io | `ODDS_API_IO_KEY` + `ENABLE_ODDS_API_IO=true` | Cobertura adicional de casas (`/events`, `/odds/multi`) | Opcional, detrás de feature flag |
| TheSportsDB | `THESPORTSDB_KEY` | Escudos y estadio cuando faltan | Solo metadatos, nunca cuotas ni estadísticas |

## ESPN (gratis)

- Sin registro. Endpoints: `site/v2/sports/soccer/{liga}/scoreboard?dates=YYYY|YYYYMM|YYYYMMDD&limit=1000` y `v2/sports/soccer/{liga}/standings`.
- `sync:espn-history` carga años completos (`ESPN_HISTORY_YEARS` atrás + actual + siguiente). Es reanudable: salta los años ya cargados y deja pendientes los que no alcancen el presupuesto de tiempo.
- `sync:espn-fixtures` mantiene la ventana rodante (`ESPN_WINDOW_PAST_DAYS` atrás, `ESPN_WINDOW_FUTURE_DAYS` adelante: semana pasada, actual y siguientes), cuotas de referencia de partidos no iniciados y la clasificación. Unas 3 peticiones por liga.
- `sync:espn-live` consulta el día solo para ligas con partidos en curso o por empezar.
- Las cuotas de ESPN (DraftKings) **no** son de un operador autorizado en Colombia: se guardan con `isAuthorized=false`, alimentan el consenso de mercado del modelo (`REFERENCE_BOOKMAKERS`) y se muestran como "referencia" en `/pronosticos`, nunca en el comparador ni con enlaces de apuesta.
- Ligas: slugs ESPN (`col.1` Liga BetPlay, `col.copa`, `conmebol.libertadores`, `conmebol.sudamericana`, `eng.1`, `esp.1`, `ita.1`, `ger.1`, `fra.1`, `uefa.champions`, `uefa.europa`, `uefa.europa.conf`, `por.1`, `ned.1`, `eng.2`, `arg.1`, `bra.1`, `mex.1`, `usa.1`, `ecu.1`, y otras como `chi.1`, `per.1`, `uru.1`, `tur.1`, `fifa.friendly`).
- Son endpoints públicos no documentados: si cambian, los jobs fallan de forma visible en `/status` y no se inventan datos.

## Groq (gratis, opcional)

- Clave gratuita en console.groq.com → `GROQ_API_KEY`. Modelo por defecto `llama-3.3-70b-versatile` (`GROQ_MODEL`).
- `compute:ai-analysis` redacta un análisis de 120–170 palabras para los partidos de las próximas `GROQ_HORIZON_HOURS` horas, a partir de datos ya calculados (probabilidades, goles esperados, forma, tabla, H2H). Tiene prohibido inventar lesiones o noticias. Máximo `GROQ_MAX_PER_RUN` por ejecución; ante un 429 se detiene y continúa en la siguiente.

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
