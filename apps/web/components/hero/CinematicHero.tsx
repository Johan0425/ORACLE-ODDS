'use client';

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function CinematicHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const maskRectRef = useRef<SVGRectElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      // Entrada: el logo se revela deslizando una máscara SVG de izquierda a derecha.
      const entrance = gsap.timeline({ defaults: { ease: 'power4.out' } });
      entrance
        .fromTo(maskRectRef.current, { attr: { width: '0%' } }, { attr: { width: '100%' }, duration: 1.4 })
        .fromTo(taglineRef.current, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 }, '-=0.5');

      // Scroll storytelling: al bajar, el hero se desvanece y escala con scroll
      // nativo (scrub), sin scroll-jacking ni pinning que le quite el control al usuario.
      gsap.to(contentRef.current, {
        yPercent: -20,
        scale: 0.92,
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-background"
    >
      <AmbientGlow />

      <div ref={contentRef} className="relative z-10 flex flex-col items-center px-6 text-center">
        <svg viewBox="0 0 1200 220" className="w-[min(92vw,900px)]" role="img" aria-label="ORACLE ODDS">
          <defs>
            <mask id="hero-reveal-mask">
              <rect ref={maskRectRef} x="0" y="0" width="0%" height="100%" fill="white" />
            </mask>
          </defs>
          <text
            x="50%"
            y="58%"
            textAnchor="middle"
            dominantBaseline="middle"
            mask="url(#hero-reveal-mask)"
            className="fill-foreground font-display text-[9rem] font-bold uppercase tracking-tight"
          >
            Oracle Odds
          </text>
        </svg>

        <p ref={taglineRef} className="mt-4 text-sm uppercase tracking-[0.4em] text-gold opacity-0">
          Data-Driven Certainty
        </p>
      </div>
    </section>
  );
}

// Fondo ambiental sutil (gradientes, no R3F): mantiene el look premium del hero
// sin el coste de performance de un fondo 3D con partículas en el MVP.
function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-1/2 h-[60vw] w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10 blur-[120px]" />
      <div className="absolute left-1/4 top-3/4 h-[30vw] w-[30vw] rounded-full bg-neon/10 blur-[100px]" />
    </div>
  );
}
