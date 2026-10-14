import type { ShareAsset } from './api';
import { formatKickoff, odds, pct } from './format';

export const SHARE_SIZES = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1200, height: 628 },
  whatsapp: { width: 1080, height: 1920 },
  telegram: { width: 1200, height: 675 },
} as const;
export type ShareSize = keyof typeof SHARE_SIZES;

export interface ShareLines {
  title: string;
  subtitle: string;
  when: string | null;
  rows: Array<[string, string]>;
  headline: string | null;
}

/** Contenido textual común a PNG y PDF: una sola fuente de verdad. */
export function shareLines(asset: ShareAsset): ShareLines {
  const p = asset.payload.picks?.[0];
  if (p) {
    const rows: Array<[string, string]> = p.selection
      ? [
          ['Mercado', p.market],
          ['Mejor cuota', `${odds(p.odds)}${p.bookmaker ? ` · ${p.bookmaker}` : ''}`],
          ['Probabilidad estimada', pct(p.probability)],
          ['Cuota justa', odds(p.fairOdds)],
          ['Edge / EV', `${p.edge == null ? '—' : `${(p.edge * 100).toFixed(1)} p.p.`} / ${pct(p.expectedValue)}`],
          ['Confianza', p.confidence ?? '—'],
        ]
      : [['Análisis', 'Comparación de cuotas y probabilidades']];
    return { title: `${p.homeTeam} vs ${p.awayTeam}`, subtitle: p.league, when: `${formatKickoff(p.kickoff)} (hora Colombia)`, rows, headline: p.selection || null };
  }
  const c = asset.payload.combination;
  if (c) {
    return {
      title: `Combinada de ${c.legs.length} selecciones`,
      subtitle: 'Simulación en unidades',
      when: null,
      rows: [...c.legs.slice(0, 6).map((l, i) => [`${i + 1}. ${(l.label ?? 'Selección').slice(0, 48)}`, odds(l.odds)] as [string, string]), ['Cuota total', odds(c.combinedOdds)], ['Probabilidad estimada', pct(c.adjustedProbability)], ['Riesgo', c.riskLevel]],
      headline: null,
    };
  }
  const ch = asset.payload.challenge;
  return { title: ch?.title ?? 'Reto', subtitle: 'Reto social sin dinero real', when: ch ? `Cierra ${formatKickoff(ch.endsAt)}` : null, rows: [['Código', ch?.code ?? '']], headline: 'Únete con un alias' };
}

export const SHARE_FOOTER = ['Cuotas sujetas a cambios', 'Pronóstico estadístico, no garantía de resultado', '18+ | Juega responsablemente'];
