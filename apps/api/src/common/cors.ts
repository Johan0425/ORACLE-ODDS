export function resolveCorsOrigins(): boolean | string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) return true; // dev: sin restricción
  return raw.split(',').map((origin) => origin.trim());
}
