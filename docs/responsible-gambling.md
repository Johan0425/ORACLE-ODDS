# Juego responsable y cumplimiento (configuración inicial: Colombia)

ORACLE ODDS es un comparador informativo y herramienta estadística. **No** es operador: no recibe apuestas, no custodia fondos y no permite completar apuestas en la plataforma.

## Implementado en la experiencia

| Requisito | Implementación |
|---|---|
| Age gate 18+ sin cuenta | `components/compliance/AgeGate.tsx`: declaración de edad con cookie técnica `oo_age_ok`; quien declara ser menor no accede |
| Aviso visible de juego responsable | Barra superior en todas las páginas + tarjeta en la portada + pie |
| Riesgo de adicción | Texto central en `lib/compliance.ts` reutilizado en avisos, piezas compartibles y slip |
| Sin mensajes a menores | Sin personajes, lenguaje ni promociones dirigidas a menores; texto explícito de prohibición |
| Sin falsas expectativas | Ningún texto usa "seguro", "garantizado" o "infalible"; arbitraje como "teórico"; piezas con "Pronóstico estadístico, no garantía de resultado" |
| Divulgación de afiliación | Etiquetas "Enlace de afiliado"/"Patrocinado", `rel="sponsored"`, texto en pie y landing |
| Solo operadores autorizados | `ALLOWED_BOOKMAKERS` gobierna `isAuthorized`; las no autorizadas nunca se muestran |
| Recursos oficiales | `/responsible-gambling` con enlaces a Coljuegos, Ministerio de Salud y Jugadores Anónimos |
| Políticas | `/privacy`, `/cookies`, `/terms`, `/disclaimer`, `/methodology` |
| Fecha y fuente de cuotas | Comparador con "actualizada hace…", frescura y casa de cada cuota |
| Historial público | `/track-record` con todas las oportunidades, incluidas pérdidas |
| Bankroll prudente | Kelly fraccional 0.25, máx. 2 u por selección, límites diario/semanal, sin martingalas, advertencia de varianza |
| Retos sin dinero | Sin pagos, depósitos ni premios; moderación bloquea textos con premios monetarios |

## Mensajes obligatorios

- "ORACLE ODDS ofrece estimaciones estadísticas y comparación informativa de cuotas. Ningún pronóstico garantiza un resultado."
- "Las cuotas pueden cambiar. Verifica la información directamente con el operador antes de tomar una decisión."
- "Jugar sin control puede generar adicción. Solo para mayores de 18 años."

## Casino

No se implementa ningún "predictor de casino": no existe predicción legítima del siguiente resultado de un generador aleatorio. Si en el futuro se añade contenido de casino, se limita a comparación informativa de operadores autorizados, reglas, RTP y volatilidad publicados y verificables, términos de promociones y juego responsable.

## Antes de lanzar en un territorio nuevo

1. Revisión legal de la normativa publicitaria de juegos de suerte y azar del territorio.
2. Actualizar `lib/compliance.ts` (región, edad mínima, recursos de ayuda verificados).
3. Configurar `ALLOWED_BOOKMAKERS` solo con operadores con licencia vigente en ese territorio.
