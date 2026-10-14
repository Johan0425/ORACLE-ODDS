import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { apiGet, type ShareAsset } from '@/lib/api';
import { SHARE_FOOTER, shareLines } from '@/lib/share-render';
import { SITE_URL } from '@/lib/site';

export const runtime = 'nodejs';

/** WinAnsi (fuentes estándar del PDF) no admite emojis ni algunos símbolos: se normalizan. */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '').trim();

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const r = await apiGet<ShareAsset>(`/share/${encodeURIComponent(code)}`, { revalidate: 60 });
  if (!r.ok) return new Response('No encontrado', { status: 404 });
  const asset = r.data;
  const lines = shareLines(asset);
  const doc = await PDFDocument.create();
  doc.setTitle(`ORACLE ODDS — ${safe(lines.title)}`);
  doc.setProducer('ORACLE ODDS');
  const page = doc.addPage([595, 842]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const gold = rgb(0.85, 0.71, 0.29);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.4, 0.4, 0.42);
  let y = 790;
  page.drawText('ORACLE ODDS', { x: 48, y, size: 16, font: bold, color: gold });
  y -= 40;
  page.drawText(safe(lines.subtitle), { x: 48, y, size: 11, font, color: muted });
  y -= 26;
  page.drawText(safe(lines.title), { x: 48, y, size: 22, font: bold, color: ink, maxWidth: 500 });
  if (lines.when) {
    y -= 22;
    page.drawText(safe(lines.when), { x: 48, y, size: 11, font, color: muted });
  }
  if (lines.headline) {
    y -= 34;
    page.drawText(safe(lines.headline), { x: 48, y, size: 16, font: bold, color: ink });
  }
  y -= 30;
  for (const [k, v] of lines.rows) {
    page.drawText(safe(k), { x: 48, y, size: 11, font, color: muted });
    page.drawText(safe(v), { x: 300, y, size: 11, font: bold, color: ink });
    y -= 22;
  }
  const shortUrl = `${SITE_URL}/s/${asset.publicCode}`;
  const qrPng = await QRCode.toBuffer(shortUrl, { margin: 1, width: 300 });
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: 415, y: 60, width: 130, height: 130 });
  let fy = 170;
  for (const t of [...SHARE_FOOTER, ...(asset.sponsor ? [`${asset.sponsor.label} (contenido patrocinado)`] : []), shortUrl, `Generado: ${asset.payload.generatedAt}`]) {
    page.drawText(safe(t), { x: 48, y: fy, size: 9, font, color: muted });
    fy -= 16;
  }
  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="oracle-odds-${asset.publicCode}.pdf"`, 'Cache-Control': 'public, max-age=300' },
  });
}
