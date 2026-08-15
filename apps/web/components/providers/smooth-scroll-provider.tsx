'use client';

import { useEffect, type PropsWithChildren } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Sincroniza Lenis (scroll con inercia) con el ticker de GSAP, para que
 * ScrollTrigger lea la posición de scroll suavizada en vez del scroll nativo
 * crudo del navegador. Es lo que hace que el parallax del hero se sienta fluido.
 */
export function SmoothScrollProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);

    const syncTicker = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(syncTicker);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(syncTicker);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
