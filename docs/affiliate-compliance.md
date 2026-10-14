# Afiliación y patrocinio (BetSantander)

## Diseño

- Configuración central en `SponsorService` (API) expuesta en `GET /api/v1/sponsor/config?placement=…`. El frontend nunca codifica publicidad: `SponsorBanner` solo aparece si la API lo habilita para esa ubicación.
- Campos: `enabled`, nombre, logo, destino, affiliate ID, campaña, ubicaciones permitidas (`BET_SANTANDER_PLACEMENTS`), divulgación, países (`BET_SANTANDER_ALLOWED_COUNTRIES`), vigencia (`BET_SANTANDER_STARTS_AT`/`ENDS_AT`), tope de frecuencia (`BET_SANTANDER_FREQUENCY_CAP`, por día y ubicación en el navegador), restricción de edad y texto de juego responsable.
- Ubicaciones: `hero_secondary`, `below_comparator`, `bet_slip`, `landing`, `share_footer`, `challenge_sponsor`, `post_analysis`, `newsletter`. No hay pop-ups ni interrupciones.

## Activación (checklist obligatoria)

En producción el patrocinio **no se activa** aunque `BET_SANTANDER_ENABLED=true` si falta `BET_SANTANDER_VERIFIED_AT`. Antes de rellenarla:

- [ ] Identidad legal del operador verificada (razón social, NIT).
- [ ] Licencia/autorización vigente de Coljuegos (o regulador del territorio) verificada; registrar en `BET_SANTANDER_LICENSE_LABEL`.
- [ ] Contrato que permite afiliación (CPA, revenue share o híbrido) firmado.
- [ ] Términos, promociones y enlaces revisados por escrito. **No publicar bonos no confirmados.**
- [ ] Nombres de parámetros del enlace confirmados con el operador (`BET_SANTANDER_AFFILIATE_PARAM`, `_SUBID_PARAM`, `_CLICKID_PARAM`).

Si algo no se puede verificar, el patrocinio permanece desactivado.

## Tracking

- Clic server-side: el frontend enlaza a `/go?bookmaker=…&placement=…`; la ruta (sin prefetch) llama a `POST /api/v1/affiliate/click`, que registra `AffiliateClick` (clickId, ubicación como subID, campaña, UTM, referrer, hash de sesión) y devuelve el destino con `utm_*`, subID y click ID.
- Impresiones agregadas por día/ubicación (`affiliate_impressions_daily`) para CTR, sin datos personales.
- Conversiones: `POST /api/v1/affiliate/postback` solo si existe `BET_SANTANDER_POSTBACK_SECRET` y el operador documenta oficialmente el postback; la firma es HMAC-SHA256 del cuerpo en `x-signature`. **Nunca se simulan conversiones.**
- Dashboard: `GET /api/v1/admin/affiliate/stats` (con `x-admin-secret`): clics, impresiones, CTR y conversiones verificadas.
- Casas distintas del patrocinador solo redirigen si están autorizadas (destino: `affiliateUrl` → enlace directo del proveedor → sitio web).

## Privacidad

- La IP no se guarda en claro. `anonymousSessionHash` = HMAC(IP + user-agent) con `ANON_HASH_SALT` rotada por día (no permite seguir a una persona entre días).
- Retención documentada: clics 13 meses (conciliación), logs 30 días.

## Separación editorial/comercial

El orden de oportunidades depende solo de la puntuación de calidad. El patrocinio no cambia probabilidades, umbrales ni rankings. El contenido patrocinado se etiqueta siempre.

## Modelos de negocio admitidos

CPA, revenue share o híbrido con operadores autorizados y contrato; espacios patrocinados; widgets para medios (`/embed/fixture/[id]`); patrocinio de retos sin dinero; contenido SEO patrocinado identificado. Premios reales en retos permanecen desactivados hasta revisión jurídica.
