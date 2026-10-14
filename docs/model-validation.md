# Validación del modelo

## Backtest walk-forward (`compute:model-metrics`)

1. Toma los partidos terminados del último año (máx. 1.500).
2. Para cada uno genera una predicción con corte **1 hora antes del inicio**, usando solo datos anteriores (corridas `BACKTEST`, idempotentes por hash).
3. Liquida cada selección con el resultado oficial.
4. Por mercado, ordena las muestras por fecha y separa **70% antiguo (calibración) / 30% reciente (prueba)**.
5. Ajusta el calibrador en la parte antigua: Platt con ≥ 150 muestras, isotónica con ≥ 1.000; si no, identidad.
6. Evalúa en la parte reciente: Brier, log loss, ECE (10 bins), accuracy (secundaria) y curva de fiabilidad, frente a un baseline de frecuencia base.
7. **Publicación**: un mercado se publica solo si `n ≥ CALIBRATION_MIN_SAMPLES` (300), `ECE ≤ CALIBRATION_MAX_ECE` (0.05) y Brier calibrado < Brier del baseline.
8. El calibrador de producción se reajusta con toda la muestra validada y se versiona en `calibration_models`.

Las métricas por liga se calculan para transparencia (≥ 30 muestras) pero no deciden la publicación.

## Métricas reales (después de publicar)

- **Calibración en vivo**: última predicción emitida antes del inicio de cada partido (`source = live-calibration`).
- **Apuestas simuladas**: oportunidades publicadas liquidadas a stake plano de 1 u a la cuota de publicación: ROI, yield por apuesta, hit rate, máximo drawdown, CLV medio (cuota tomada / cuota de cierre − 1), número de apuestas e intervalo bootstrap 95% del ROI (semilla fija, reproducible). Segmentado por mercado, liga y rango de cuota.

## Garantías contra sesgos

- Sin fuga de información (verificada por pruebas: el motor lanza ante datos posteriores al corte).
- Las cuotas de cierre solo se usan para CLV, nunca como entrada de una predicción previa.
- Las oportunidades son únicas por partido/selección y sus métricas de publicación son inmutables: recalcular no infla el historial ni permite reescribir precios.
- Las oportunidades retiradas antes del inicio también se liquidan y se muestran.
- Las pérdidas nunca se eliminan.

## Pruebas automatizadas

`packages/probability-engine/tests` cubre vig (proporcional, potencia, Shin), conversión, edge, EV, Kelly, Poisson, Dixon-Coles, Elo, fuerzas, calibración (isotónica/Platt), Brier/log loss/ECE, ROI/drawdown/CLV, bootstrap, walk-forward, combinadas, correlación, arbitraje, liquidación y en vivo.
