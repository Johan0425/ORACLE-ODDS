/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';
import type { ReactNode } from 'react';
import type { PickSelection } from './api';
import { SITE_URL } from './site';

/** Tamaño estándar de vista previa (WhatsApp, Telegram, X, Facebook). */
export const OG_SIZE = { width: 1200, height: 630 };

export const C = {
  bg: '#0B0B0D',
  surface: '#141417',
  surface2: '#1C1C21',
  line: 'rgba(255,255,255,0.12)',
  fg: '#F4F1EA',
  muted: '#A9A59C',
  gold: '#D9B44A',
  goldSoft: '#E8CF7D',
  positive: '#3DDC97',
  negative: '#FF7A7A',
  info: '#7CB8FF',
};

const host = SITE_URL.replace(/^https?:\/\//, '');

/** Marco común: fondo con brillo dorado, logo, contenido y pie con dominio y aviso +18. */
export function OgFrame({ children, eyebrow }: { children: ReactNode; eyebrow?: string }) {
  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: 'flex',
        flexDirection: 'column',
        background: `radial-gradient(circle at 88% 8%, rgba(217,180,74,0.28) 0%, rgba(217,180,74,0) 42%), linear-gradient(155deg, ${C.surface} 0%, ${C.bg} 65%)`,
        color: C.fg,
        padding: '48px 60px 40px',
        fontFamily: 'Body, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.gold, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>OO</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 8, fontFamily: 'Display' }}>ORACLE ODDS</div>
        </div>
        {eyebrow && (
          <div style={{ display: 'flex', fontSize: 22, color: C.gold, border: `2px solid rgba(217,180,74,0.5)`, borderRadius: 999, padding: '8px 20px', letterSpacing: 2, textTransform: 'uppercase' }}>{eyebrow}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, marginTop: 28 }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 20, color: C.muted, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
        <span style={{ color: C.fg, fontWeight: 700 }}>{host}</span>
        <span>Estimación estadística, no garantía · +18 · Juega con responsabilidad</span>
      </div>
    </div>
  );
}

export function Crest({ src, name, size }: { src: string | null | undefined; name: string; size: number }) {
  if (src && /^https?:\/\//.test(src)) return <img src={src} width={size} height={size} alt="" style={{ objectFit: 'contain' }} />;
  const initials = name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
  return (
    <div style={{ width: size, height: size, borderRadius: size, background: C.surface2, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size / 3), fontWeight: 700 }}>{initials}</div>
  );
}

/** Barra 1 / X / 2 con porcentajes. */
export function ProbBar({ home, draw, away, width }: { home: number; draw: number; away: number; width: number }) {
  const parts = [
    { k: '1', v: home, c: C.gold },
    { k: 'X', v: draw, c: '#6E6A62' },
    { k: '2', v: away, c: C.info },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width }}>
      <div style={{ display: 'flex', height: 18, borderRadius: 999, overflow: 'hidden' }}>
        {parts.map((p) => <div key={p.k} style={{ width: `${p.v * 100}%`, background: p.c, height: 18 }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 24, color: C.muted }}>
        {parts.map((p) => (
          <span key={p.k} style={{ display: 'flex', gap: 8 }}>
            <span>{p.k}</span>
            <span style={{ color: C.fg, fontWeight: 700 }}>{Math.round(p.v * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function pickText(p: Pick<PickSelection, 'marketKey' | 'selectionKey' | 'line'>, home: string, away: string): string {
  if (p.marketKey === '1X2') return p.selectionKey === 'HOME' ? `Gana ${home}` : p.selectionKey === 'AWAY' ? `Gana ${away}` : 'Empate';
  if (p.marketKey === 'OU_GOALS') return `${p.selectionKey === 'OVER' ? 'Más' : 'Menos'} de ${p.line ?? 2.5} goles`;
  return p.selectionKey === 'YES' ? 'Ambos marcan' : 'No marcan ambos';
}

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' };
let fontsPromise: Promise<OgFont[]> | null = null;

/** Tipografías de la marca (TTF de Google Fonts). Si no se pueden descargar se usa la fuente por defecto. */
function loadFonts(): Promise<OgFont[]> {
  fontsPromise ??= (async () => {
    try {
      // Un user agent antiguo hace que Google Fonts entregue TTF (Satori no lee WOFF2).
      const css = await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Space+Grotesk:wght@700&display=swap', {
        headers: { 'user-agent': 'Mozilla/4.0' },
        signal: AbortSignal.timeout(5_000),
      }).then((r) => r.text());
      const faces = [...css.matchAll(/font-family: '([^']+)';[^}]*?font-weight: (\d+);[^}]*?url\((https:[^)]+\.ttf)\)/g)];
      const fonts = await Promise.all(
        faces.map(async ([, family, weight, url]) => ({
          name: family === 'Space Grotesk' ? 'Display' : 'Body',
          data: await fetch(url, { signal: AbortSignal.timeout(5_000) }).then((r) => r.arrayBuffer()),
          weight: (Number(weight) >= 700 ? 700 : 400) as 400 | 700,
          style: 'normal' as const,
        })),
      );
      return fonts;
    } catch {
      fontsPromise = null;
      return [];
    }
  })();
  return fontsPromise;
}

export async function og(node: ReactNode, maxAge = 600): Promise<ImageResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(node as React.ReactElement, {
    ...OG_SIZE,
    fonts: fonts.length ? fonts : undefined,
    headers: { 'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=86400` },
  });
}
