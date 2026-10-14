# Metodología de predicción

Versión vigente: `football-ensemble-1.0.0` (`packages/probability-engine/src/ensemble/football.ts`). Los hiperparámetros están en `FOOTBALL_MODEL_CONFIG`; cualquier cambio exige una nueva versión.

## Entradas (todas anteriores a `dataCutoff`)

- Partidos terminados de la competición y de ambos equipos (últimos 730 días), con estadísticas cuando existen.
- Ausencias confirmadas (lesiones con estado `out`), alineaciones confirmadas.
- Consenso de mercado sin margen de casas autorizadas capturado antes del corte.
- Calibradores activos del mercado (ajustados fuera de muestra).

El motor **lanza error** si recibe un partido o una cuota posterior al corte.

## Componentes

1. **Fuerzas de equipo**: tasas de goles a favor/en contra separadas como local y como visitante, con peso temporal (vida media 180 días) y contracción bayesiana hacia el promedio de liga (prior de 4 partidos). Si el proveedor entrega xG, la tasa mezcla 60% xG y 40% goles reales; la diferencia goles−xG se reporta como riesgo de regresión.
2. **λ esperados** (Maher/Dixon-Coles): ataque local × defensa visitante relativos al promedio de la liga.
3. **Ajustes acotados**: descanso < 3 días, ≥ 4 partidos en 14 días, ausencias confirmadas (máx. −12% de ataque), diferencia de fuerza de liga, H2H con peso bajo (efecto máximo ±6%, vida media 2 años, mínimo 3 partidos).
4. **Matriz Dixon-Coles** con ρ = −0.08 (estimable con `estimateRho` cuando hay muestra).
5. **Elo** con multiplicador por diferencia de goles y regresión a la media por inactividad > 60 días. Se convierte a 1X2 respetando la expectativa de puntos.
6. **Ensemble 1X2**: pooling log-lineal ponderado (Dixon-Coles 0.55, Elo 0.20 —0.10 si hay < 10 partidos—, mercado 0.25 si existe). Doble oportunidad y DNB se derivan del 1X2 combinado. Totales de goles se combinan con el mercado de la misma línea.
7. **Resto de mercados** desde la matriz con las mismas reglas de liquidación que el settlement: hándicap asiático (incluye cuartos y push), europeo, BTTS, marcador correcto (solo con ≥ 20 partidos por equipo y calidad ≥ 0.8), primera mitad (solo si la liga tiene ≥ 50 marcadores al descanso), córners y tarjetas (Poisson del total, ≥ 5 partidos con dato por equipo).

## Salidas por selección

Probabilidad cruda, calibrada (si hay calibrador), intervalo de incertidumbre (envolvente al perturbar λ por su error estándar relativo, z = 1.645), cuota justa, confianza 0–1 y nivel, explicación en lenguaje natural, factores positivos/negativos y motivos de reducción de confianza. Cada corrida guarda `featureSnapshot`, `trainingWindow`, `dataCutoff`, versión y un `inputHash` (idempotencia).

## Otros deportes

`SPORT_MODELS` declara interfaces para baloncesto, tenis, béisbol, NFL, hockey y MMA con `implemented: false`: la API no publica predicciones para ellos y solo ofrece comparación de cuotas.

## Actualización en vivo

`inPlayProbabilities` usa los λ prepartido escalados por el tiempo restante (y expulsiones) sumados al marcador actual. Se presenta explícitamente como un modelo simple; las oportunidades en vivo están desactivadas por defecto (`ENABLE_LIVE_PICKS=false`).

## Lo que el modelo no hace

No es IA generativa, no "adivina" resultados y no hay predicción legítima para juegos de casino basados en generadores aleatorios.
