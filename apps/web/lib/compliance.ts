/** Textos regulatorios centralizados (Colombia como configuración inicial). */
export const COMPLIANCE = {
  region: 'CO',
  minimumAge: 18,
  disclaimer: 'ORACLE ODDS ofrece estimaciones estadísticas y comparación informativa de cuotas. Ningún pronóstico garantiza un resultado.',
  oddsChange: 'Las cuotas pueden cambiar. Verifica la información directamente con el operador antes de tomar una decisión.',
  addiction: 'Jugar sin control puede generar adicción. Solo para mayores de 18 años.',
  notOperator: 'ORACLE ODDS no es un operador de juegos de suerte y azar: no recibe apuestas, no custodia fondos y no permite completar apuestas en la plataforma.',
  affiliateDisclosure: 'Algunos enlaces son de afiliado o patrocinados y están marcados como tales. Podemos recibir una comisión; esto no modifica nuestras estimaciones.',
  forecastNotGuarantee: 'Pronóstico estadístico, no garantía de resultado.',
  noMinors: 'Prohibido para menores de edad. Este contenido no está dirigido a menores.',
  resources: [
    { name: 'Coljuegos — Juego responsable', url: 'https://www.coljuegos.gov.co/' },
    { name: 'Ministerio de Salud y Protección Social — salud mental', url: 'https://www.minsalud.gov.co/' },
    { name: 'Jugadores Anónimos', url: 'https://www.gamblersanonymous.org/' },
  ],
} as const;
