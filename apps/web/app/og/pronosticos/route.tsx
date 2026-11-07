import { picksOgImage } from '@/lib/og-picks';

export const runtime = 'nodejs';

/** Imagen Open Graph de /pronosticos según la semana y la liga compartidas. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const offset = Math.max(-8, Math.min(8, Number.parseInt(url.searchParams.get('semana') ?? '0', 10) || 0));
  const liga = url.searchParams.get('liga');
  return picksOgImage(offset, liga && /^[a-z0-9]{10,40}$/i.test(liga) ? liga : null);
}
