'use client';

import { useId, useMemo, useRef, useState } from 'react';

/** Paleta categórica validada para la superficie oscura (#141417): máx. 4 series, en orden fijo. */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'];

export interface Series {
  id: string;
  label: string;
  points: Array<{ x: number; y: number }>;
}

interface Props {
  series: Series[];
  height?: number;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  ariaLabel: string;
  /** Línea de referencia horizontal (p. ej. 0 en un gráfico de unidades). */
  baseline?: number;
  /** Diagonal y = x (curvas de calibración). */
  diagonal?: boolean;
  dots?: boolean;
}

/**
 * Gráfico de líneas SVG sin dependencias: un solo eje Y, rejilla recesiva,
 * líneas de 2px, cruz + tooltip al pasar el cursor/teclado, leyenda y
 * etiqueta directa al final de cada serie, y vista de tabla accesible.
 */
export function LineChart({ series, height = 240, formatX, formatY, ariaLabel, baseline, diagonal, dots }: Props) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const width = 640;
  const pad = { l: 48, r: 96, t: 12, b: 28 };
  const visible = series.slice(0, 4).filter((s) => s.points.length > 0);

  const { xMin, xMax, yMin, yMax, xs } = useMemo(() => {
    const all = visible.flatMap((s) => s.points);
    const ys = all.map((p) => p.y).concat(baseline != null ? [baseline] : []);
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    if (diagonal) {
      lo = 0;
      hi = 1;
    }
    const span = hi - lo || Math.abs(hi) * 0.1 || 1;
    const xsAll = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
    return {
      xMin: diagonal ? 0 : Math.min(...xsAll),
      xMax: diagonal ? 1 : Math.max(...xsAll),
      yMin: diagonal ? 0 : lo - span * 0.08,
      yMax: diagonal ? 1 : hi + span * 0.08,
      xs: xsAll,
    };
  }, [visible, baseline, diagonal]);

  if (visible.length === 0) return <p className="text-sm text-muted">Sin datos suficientes para graficar.</p>;

  const sx = (x: number) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * (width - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin || 1)) * (height - pad.t - pad.b);
  const ticks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * (i + 0.5)) / 4);
  const xTicks = [xMin, (xMin + xMax) / 2, xMax];

  const nearest = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = xMin + ((((clientX - rect.left) / rect.width) * width - pad.l) / (width - pad.l - pad.r)) * (xMax - xMin);
    let best = 0;
    xs.forEach((v, i) => {
      if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i;
    });
    setHover(best);
  };

  const hx = hover != null ? xs[hover] : null;
  const valueAt = (s: Series, x: number) => {
    const before = [...s.points].filter((p) => p.x <= x).pop();
    return before?.y ?? null;
  };

  return (
    <figure className="space-y-2">
      {visible.length >= 2 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Leyenda">
          {visible.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: SERIES_COLORS[i] }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="w-full touch-none select-none"
          tabIndex={0}
          onPointerMove={(e) => nearest(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setHover((h) => Math.min(xs.length - 1, (h ?? -1) + 1));
            if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? xs.length) - 1));
            if (e.key === 'Escape') setHover(null);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={pad.l - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="#A9A59C">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={sx(t)} y={height - 8} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontSize="11" fill="#A9A59C">
              {formatX(t)}
            </text>
          ))}
          {baseline != null && <line x1={pad.l} x2={width - pad.r} y1={sy(baseline)} y2={sy(baseline)} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />}
          {diagonal && <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />}
          {visible.map((s, i) => {
            const pts = [...s.points].sort((a, b) => a.x - b.x);
            const d = pts.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
            const last = pts[pts.length - 1];
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={SERIES_COLORS[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {(dots || pts.length === 1) && pts.map((p, j) => <circle key={j} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={SERIES_COLORS[i]} stroke="#141417" strokeWidth={2} />)}
                <text x={sx(last.x) + 6} y={sy(last.y)} dominantBaseline="middle" fontSize="11" fill="#F4F1EA">
                  {visible.length > 1 ? `${s.label.slice(0, 12)} ` : ''}
                  {formatY(last.y)}
                </text>
              </g>
            );
          })}
          {hx != null && (
            <g pointerEvents="none">
              <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.35)" />
              {visible.map((s, i) => {
                const v = valueAt(s, hx);
                return v == null ? null : <circle key={s.id} cx={sx(hx)} cy={sy(v)} r={4.5} fill={SERIES_COLORS[i]} stroke="#141417" strokeWidth={2} />;
              })}
            </g>
          )}
        </svg>
        {hx != null && (
          <div role="status" className="pointer-events-none absolute top-2 rounded-lg border border-line bg-surface-2/95 px-3 py-2 text-xs shadow-xl" style={{ left: `${Math.min(70, (sx(hx) / width) * 100)}%` }}>
            <p className="font-semibold text-foreground">{formatX(hx)}</p>
            {visible.map((s, i) => {
              const v = valueAt(s, hx);
              return (
                <p key={s.id} className="flex items-center gap-1.5 text-muted">
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i] }} />
                  {s.label}: <span className="tabular text-foreground">{v == null ? '—' : formatY(v)}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
      <figcaption>
        <button type="button" className="text-xs text-muted underline" aria-expanded={showTable} aria-controls={`${id}-table`} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Ocultar tabla' : 'Ver como tabla'}
        </button>
        {series.length > 4 && <span className="ml-2 text-xs text-muted">Se muestran 4 de {series.length} series.</span>}
      </figcaption>
      {showTable && (
        <div id={`${id}-table`} className="max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr>
                <th className="px-2 py-1 text-left">Punto</th>
                {visible.map((s) => (
                  <th key={s.id} className="px-2 py-1 text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {xs.map((x) => (
                <tr key={x} className="border-t border-line">
                  <td className="px-2 py-1">{formatX(x)}</td>
                  {visible.map((s) => {
                    const v = s.points.find((p) => p.x === x)?.y;
                    return (
                      <td key={s.id} className="px-2 py-1 text-right">{v == null ? '—' : formatY(v)}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
