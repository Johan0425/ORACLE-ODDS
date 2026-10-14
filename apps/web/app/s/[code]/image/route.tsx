import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import { apiGet, type ShareAsset } from '@/lib/api';
import { SHARE_FOOTER, SHARE_SIZES, shareLines, type ShareSize } from '@/lib/share-render';
import { formatKickoff } from '@/lib/format';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';

/** Pieza PNG generada en servidor con Satori/Resvg (next/og): sin capturas manuales. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const r = await apiGet<ShareAsset>(`/share/${encodeURIComponent(code)}`, { revalidate: 60 });
  if (!r.ok) return new Response('No encontrado', { status: 404 });
  const asset = r.data;
  const format = (url.searchParams.get('format') as ShareSize) in SHARE_SIZES ? (url.searchParams.get('format') as ShareSize) : (asset.format as ShareSize) in SHARE_SIZES ? (asset.format as ShareSize) : 'square';
  const { width, height } = SHARE_SIZES[format];
  const tall = height > width;
  const scale = width / 1080;
  const lines = shareLines(asset);
  const shortUrl = `${SITE_URL}/s/${asset.publicCode}`;
  const qr = await QRCode.toDataURL(shortUrl, { margin: 1, width: 360, color: { dark: '#0B0B0D', light: '#F4F1EA' } });
  const fs = (n: number) => Math.round(n * scale * (tall ? 1.1 : format === 'square' ? 1 : 0.82));

  const image = new ImageResponse(
    (
      <div style={{ width, height, display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg,#141417 0%,#0B0B0D 60%)', color: '#F4F1EA', padding: fs(64), fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: fs(16) }}>
            <div style={{ width: fs(48), height: fs(48), borderRadius: fs(12), background: '#D9B44A', color: '#0B0B0D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs(22), fontWeight: 700 }}>OO</div>
            <div style={{ fontSize: fs(30), fontWeight: 700, letterSpacing: fs(8) }}>ORACLE ODDS</div>
          </div>
          <div style={{ fontSize: fs(22), color: '#A9A59C' }}>{formatKickoff(asset.payload.generatedAt, { dateStyle: 'short', timeStyle: 'short' })}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: fs(tall ? 120 : 48) }}>
          <div style={{ fontSize: fs(26), color: '#D9B44A', textTransform: 'uppercase', letterSpacing: fs(4) }}>{lines.subtitle}</div>
          <div style={{ fontSize: fs(64), fontWeight: 700, marginTop: fs(12), lineHeight: 1.1 }}>{lines.title}</div>
          {lines.when && <div style={{ fontSize: fs(28), color: '#A9A59C', marginTop: fs(12) }}>{lines.when}</div>}
          {lines.headline && <div style={{ fontSize: fs(48), fontWeight: 700, color: '#E8CF7D', marginTop: fs(36) }}>{lines.headline}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: fs(32), gap: fs(10) }}>
          {lines.rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.12)', paddingBottom: fs(10), fontSize: fs(30) }}>
              <span style={{ color: '#A9A59C' }}>{k}</span>
              <span style={{ fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', alignItems: 'flex-end', justifyContent: 'space-between', gap: fs(24) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: fs(6), fontSize: fs(22), color: '#A9A59C' }}>
            {SHARE_FOOTER.map((t) => (
              <span key={t}>{t}</span>
            ))}
            {asset.sponsor && <span style={{ color: '#F5B94A' }}>{asset.sponsor.label} · contenido patrocinado</span>}
            <span style={{ color: '#F4F1EA', fontSize: fs(24) }}>{shortUrl.replace(/^https?:\/\//, '')}</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={fs(180)} height={fs(180)} alt="" style={{ borderRadius: fs(12) }} />
        </div>
      </div>
    ),
    { width, height },
  );
  const headers = new Headers(image.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  if (url.searchParams.get('download')) headers.set('Content-Disposition', `attachment; filename="oracle-odds-${asset.publicCode}-${format}.png"`);
  return new Response(image.body, { status: 200, headers });
}
