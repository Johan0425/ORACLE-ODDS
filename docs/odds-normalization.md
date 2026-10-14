# Normalización de cuotas y entidades

## Identificadores canónicos

Deportes, países, competiciones, temporadas, equipos, jugadores, partidos y casas tienen ID interno. `provider_entity_maps (provider, entityType, externalId) → internalId` es único; si un mapeo ya existe apuntando a otra entidad se conserva y se registra el conflicto (no se sobrescribe en silencio). Mercados y selecciones usan claves canónicas de `packages/probability-engine/src/markets/keys.ts`.

| Clave | Mercado | Selecciones | Línea |
|---|---|---|---|
| `1X2` | Resultado final | HOME, DRAW, AWAY | — |
| `ML` | Ganador dos vías | HOME, AWAY | — |
| `DC` | Doble oportunidad | HOME_DRAW, HOME_AWAY, DRAW_AWAY | — |
| `DNB` | Empate no válido | HOME, AWAY | — |
| `OU_GOALS`, `OU_CORNERS`, `OU_CARDS`, `OU_POINTS` | Totales | OVER, UNDER | sí |
| `BTTS` | Ambos marcan | YES, NO | — |
| `AH`, `SPREAD` | Hándicap asiático / puntos | HOME, AWAY | sí, **siempre desde el local** |
| `EH` | Hándicap europeo | HOME, DRAW, AWAY | sí |
| `CS` | Marcador correcto | `h-a` | — |
| `1X2_H1`, `OU_GOALS_H1` | Primera mitad | como FT | según mercado |

`lineKey` normaliza la línea a cuartos (`"2.5"`, `"-0.25"`, `""` sin línea) para claves únicas estables.

## Mapeo por proveedor

- **The Odds API**: `h2h` → `1X2` en fútbol (incluye Draw) o `ML`; `spreads` → `AH`/`SPREAD` (la línea del visitante se invierte para quedar desde el local); `totals` → `OU_GOALS`/`OU_POINTS`; `btts`, `draw_no_bet` cuando se piden.
- **API-Football odds**: por nombre de apuesta (`Match Winner`, `Goals Over/Under`, `Asian Handicap`, `Both Teams Score`, `Double Chance`, `Exact Score`, `Corners Over Under`, `Cards Over/Under`, primera mitad…). Apuestas desconocidas se descartan.
- **odds-api.io**: `ML`, `Spread`, `Totals`, `Both Teams To Score`, `Draw No Bet`, variantes `HT`.

## Deduplicación de partidos

Orden de resolución en `EntityResolverService.upsertFixture` / `resolveOddsEvent`:

1. ID externo ya mapeado.
2. Mismos equipos canónicos dentro de la tolerancia horaria (`FIXTURE_MATCH_TOLERANCE_MINUTES`, 90 por defecto) o un partido aplazado de ±30 días.
3. Coincidencia difusa (`fixture-matching.ts`): mismo deporte, misma competición si se conoce, ambos equipos con similitud ≥ 0.72 **en su rol** local/visitante, horario dentro de la tolerancia contra el horario actual u original (reprogramaciones), bonificación por sede. Si dos candidatos quedan a < 0.02 de puntuación, **no se empareja** (ambigüedad).
4. Si nada coincide, se crea el partido con la procedencia del proveedor.

La similitud de nombres (`names.ts`) quita acentos y sufijos (FC, CF…), aplica alias y penaliza cuando ambos nombres tienen tokens propios ("Manchester United" vs "Manchester City" < umbral). Los nombres nunca son la única clave.

Los cambios de horario guardan `originalKickoff` y `kickoffChangedAt`; API-Football es autoritativo para horario, estado y marcador.

## Idempotencia de cuotas

- Si el precio y el estado de suspensión de una selección no cambian, solo se actualiza `lastSeenAt` del `OddsQuote`.
- Si cambian, se inserta un `OddsSnapshot` (único por partido/casa/mercado/selección/línea/modo y `rawPayloadHash` = hash de precio + estado + timestamp de origen) y se actualiza la cotización vigente conservando `openingPrice`.
- `impliedProbabilityNoVig` y `overround` se calculan por libro completo (misma casa, mercado, línea y modo) con `VIG_METHOD` (`power` por defecto; `proportional`, `shin`).
- En vivo, las selecciones que el proveedor deja de ofrecer se marcan suspendidas.

## Consenso y mejores precios

- Mejor cuota: máximo entre casas autorizadas, activas, no suspendidas y no vencidas (`PREMATCH_ODDS_STALE_SECONDS`, `LIVE_ODDS_STALE_SECONDS`).
- Probabilidad de mercado sin vig: promedio de libros completos.
- Arbitraje: con la mejor cuota de cada selección de un libro completo, Σ 1/cuota < 1. Se presenta como cálculo teórico con advertencia; nunca se ejecutan apuestas.
