'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { apiPost, type ShareAsset } from '@/lib/api';

const FORMATS = [
  { key: 'square', label: 'Cuadrada 1080×1080' },
  { key: 'story', label: 'Historia 1080×1920' },
  { key: 'landscape', label: 'Post 1200×628' },
  { key: 'whatsapp', label: 'Estado de WhatsApp' },
  { key: 'telegram', label: 'Telegram compacta' },
] as const;

export type ShareEntity = 'value_bet' | 'combination' | 'fixture' | 'challenge';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(asset: ShareAsset): string {
  const rows: string[][] = [];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  if (asset.payload.picks) {
    rows.push(['partido', 'liga', 'inicio', 'mercado', 'seleccion', 'cuota', 'casa', 'probabilidad', 'cuota_justa', 'edge', 'ev']);
    for (const p of asset.payload.picks) rows.push([`${p.homeTeam} vs ${p.awayTeam}`, p.league, p.kickoff, p.market, p.selection, String(p.odds ?? ''), p.bookmaker ?? '', String(p.probability ?? ''), String(p.fairOdds ?? ''), String(p.edge ?? ''), String(p.expectedValue ?? '')]);
  } else if (asset.payload.combination) {
    rows.push(['seleccion', 'cuota', 'probabilidad']);
    for (const l of asset.payload.combination.legs) rows.push([l.label ?? '', String(l.odds), String(l.probability ?? '')]);
    rows.push(['TOTAL', String(asset.payload.combination.combinedOdds), String(asset.payload.combination.adjustedProbability ?? '')]);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

/** Genera la pieza en el servidor (snapshot con cuota refrescada) y ofrece todas las vías de compartir. */
export function ShareComposer({ entityType, entityId, onClose }: { entityType: ShareEntity; entityId: string; onClose: () => void }) {
  const [format, setFormat] = useState<(typeof FORMATS)[number]['key']>('square');
  const [sponsor, setSponsor] = useState(true);
  const [asset, setAsset] = useState<ShareAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async () => {
    setError(null);
    const r = await apiPost<ShareAsset>('/share-assets', { entityType, entityId, format, showSponsor: sponsor });
    if (!r.ok) return setError(r.error);
    const absolute = r.data.shortUrl.startsWith('http') ? r.data.shortUrl : `${window.location.origin}${r.data.shortUrl}`;
    setAsset({ ...r.data, shortUrl: absolute, shareText: r.data.shareText.replace(r.data.shortUrl, absolute) });
    setQr(await QRCode.toDataURL(absolute, { margin: 1, width: 240, color: { dark: '#0B0B0D', light: '#F4F1EA' } }));
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied('No se pudo copiar');
    }
  };

  const enc = encodeURIComponent;
  const imagePath = asset ? `/s/${asset.publicCode}/image?format=${format}` : null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/80 p-3 backdrop-blur" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="share-title" className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="share-title" className="font-display text-xl font-bold">Compartir</h2>
          <button type="button" className="btn-ghost px-3" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {!asset ? (
          <div className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-sm text-muted">Formato</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {FORMATS.map((f) => (
                  <label key={f.key} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${format === f.key ? 'border-gold text-gold-soft' : 'border-line'}`}>
                    <input type="radio" name="format" value={f.key} checked={format === f.key} onChange={() => setFormat(f.key)} className="accent-[#D9B44A]" />
                    {f.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={sponsor} onChange={(e) => setSponsor(e.target.checked)} className="accent-[#D9B44A]" />
              Incluir mención del patrocinador (solo si el patrocinio está activo)
            </label>
            {error && <p role="alert" className="text-sm text-negative">{error}</p>}
            <button type="button" className="btn-primary" onClick={generate} data-testid="share-generate">
              Generar pieza
            </button>
            <p className="text-xs text-muted">La pieza se genera con la cuota vigente en este momento e incluye “Cuotas sujetas a cambios”, “18+” y “Pronóstico estadístico, no garantía de resultado”.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-5 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              {imagePath && <img src={imagePath} alt="Vista previa de la pieza" className="max-h-80 w-auto rounded-xl border border-line" data-testid="share-preview" />}
              <label className="block text-sm text-muted">
                Mensaje listo para grupos
                <textarea readOnly value={asset.shareText} rows={9} className="input mt-1 font-mono text-xs" data-testid="share-text" />
              </label>
            </div>
            <div className="flex flex-col items-center gap-3">
              {qr && <img src={qr} alt={`Código QR hacia ${asset.shortUrl}`} width={160} height={160} className="rounded-lg" />}
              <code className="text-xs text-muted">{asset.shortUrl.replace(/^https?:\/\//, '')}</code>
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" className="btn-primary" onClick={() => navigator.share({ title: 'ORACLE ODDS', text: asset.shareText, url: asset.shortUrl }).catch(() => undefined)}>
                  Compartir…
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => copy(asset.shortUrl, 'Enlace copiado')}>Copiar enlace</button>
              <button type="button" className="btn-ghost" onClick={() => copy(asset.shareText, 'Texto copiado')}>Copiar texto</button>
              <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${enc(asset.shareText)}`}>WhatsApp</a>
              <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`https://t.me/share/url?url=${enc(asset.shortUrl)}&text=${enc(asset.shareText)}`}>Telegram</a>
              <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`https://twitter.com/intent/tweet?text=${enc(asset.shareText.slice(0, 250))}`}>X</a>
              <a className="btn-ghost" target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${enc(asset.shortUrl)}`}>Facebook</a>
              <a className="btn-ghost" href={`mailto:?subject=${enc('Análisis ORACLE ODDS')}&body=${enc(asset.shareText)}`}>Correo</a>
              {imagePath && <a className="btn-ghost" href={`${imagePath}&download=1`} download={`oracle-odds-${asset.publicCode}.png`} data-testid="share-download-png">PNG</a>}
              <a className="btn-ghost" href={`/s/${asset.publicCode}/pdf`} download={`oracle-odds-${asset.publicCode}.pdf`}>PDF</a>
              <button type="button" className="btn-ghost" onClick={() => download(`oracle-odds-${asset.publicCode}.csv`, toCsv(asset), 'text/csv')}>CSV</button>
              <button type="button" className="btn-ghost" onClick={() => download(`oracle-odds-${asset.publicCode}.json`, JSON.stringify(asset.payload, null, 2), 'application/json')}>JSON</button>
              {qr && <a className="btn-ghost" href={qr} download={`oracle-odds-${asset.publicCode}-qr.png`}>QR</a>}
            </div>
            {copied && <p role="status" className="text-sm text-positive md:col-span-2">{copied}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
