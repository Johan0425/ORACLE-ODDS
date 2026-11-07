'use client';

import { useState } from 'react';

/**
 * Comparte un listado de pronósticos como texto (WhatsApp, Telegram, X o
 * portapapeles). El texto se arma en el servidor e incluye el aviso de
 * juego responsable.
 */
export function SharePicks({ text, url }: { text: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${text}\n\n${url}`;
  const enc = encodeURIComponent;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="share-picks">
      <a className="btn-ghost" href={`https://wa.me/?text=${enc(full)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a className="btn-ghost" href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noopener noreferrer">Telegram</a>
      <a className="btn-ghost" href={`https://x.com/intent/post?text=${enc(full.slice(0, 270))}`} target="_blank" rel="noopener noreferrer">X</a>
      <button type="button" className="btn-ghost" onClick={copy} aria-live="polite">{copied ? 'Copiado ✓' : 'Copiar texto'}</button>
    </div>
  );
}
