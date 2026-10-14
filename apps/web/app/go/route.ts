import { NextResponse, type NextRequest } from 'next/server';
import { apiBase } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Redirección de afiliado: registra el clic server-side en la API (con UTM,
 * subID por ubicación y click ID) y redirige. Si el operador no está
 * autorizado o el patrocinio está desactivado, no hay redirección comercial.
 */
export async function GET(req: NextRequest) {
  // Las precargas del router o de navegadores no son clics: nunca se registran.
  const purpose = `${req.headers.get('purpose') ?? ''} ${req.headers.get('sec-purpose') ?? ''}`.toLowerCase();
  if (req.headers.get('next-router-prefetch') || req.headers.get('rsc') || purpose.includes('prefetch')) {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  const q = req.nextUrl.searchParams;
  const body = {
    bookmaker: q.get('bookmaker') ?? '',
    placement: q.get('placement') ?? 'unknown',
    fixtureId: q.get('fixtureId') ?? undefined,
    valueBetId: q.get('valueBetId') ?? undefined,
    referrer: req.headers.get('referer')?.slice(0, 300) ?? undefined,
    utmSource: q.get('utm_source') ?? 'oracle-odds',
    utmMedium: q.get('utm_medium') ?? 'web',
    utmCampaign: q.get('utm_campaign') ?? undefined,
  };
  try {
    const res = await fetch(`${apiBase()}/affiliate/click`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
        'user-agent': req.headers.get('user-agent') ?? '',
        // Sin token interno a propósito: los clics sí se limitan por IP del visitante (reenviada).
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json().catch(() => null)) as { data?: { redirectUrl?: string } } | null;
    const target = json?.data?.redirectUrl;
    if (res.ok && target && /^https?:\/\//.test(target)) {
      const out = NextResponse.redirect(target, 302);
      out.headers.set('Referrer-Policy', 'no-referrer');
      out.headers.set('X-Robots-Tag', 'noindex');
      return out;
    }
  } catch {
    /* sin API: no se redirige a ningún operador */
  }
  return NextResponse.redirect(new URL('/sponsor/betsantander?unavailable=1', req.url), 302);
}
