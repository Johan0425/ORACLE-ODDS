'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COMPLIANCE } from '@/lib/compliance';

const COOKIE = 'oo_age_ok';

function hasConsent(): boolean {
  return typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === `${COOKIE}=1`);
}

/**
 * Verificación de edad sin cuenta: declaración 18+ guardada en una cookie
 * técnica. Quien declara ser menor no accede al contenido.
 */
export function AgeGate() {
  const [state, setState] = useState<'checking' | 'ask' | 'ok' | 'minor'>('checking');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setState(hasConsent() ? 'ok' : 'ask');
  }, []);

  useEffect(() => {
    if (state === 'ask') confirmRef.current?.focus();
    document.body.style.overflow = state === 'ask' || state === 'minor' ? 'hidden' : '';
  }, [state]);

  if (state === 'ok' || state === 'checking') return null;

  const accept = () => {
    document.cookie = `${COOKIE}=1; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax; Secure`;
    setState('ok');
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="age-title" className="fixed inset-0 z-[100] grid place-items-center bg-background/95 p-4 backdrop-blur">
      <div className="card w-full max-w-md p-6 text-center shadow-glow">
        <p className="eyebrow">Solo mayores de edad</p>
        {state === 'ask' ? (
          <>
            <h2 id="age-title" className="mt-3 font-display text-2xl font-bold">¿Tienes 18 años o más?</h2>
            <p className="mt-3 text-sm text-muted">
              ORACLE ODDS muestra estimaciones estadísticas y comparación de cuotas de operadores autorizados. {COMPLIANCE.addiction}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button ref={confirmRef} type="button" className="btn-primary" onClick={accept}>
                Sí, soy mayor de 18
              </button>
              <button type="button" className="btn-ghost" onClick={() => setState('minor')}>
                No, soy menor
              </button>
            </div>
            <p className="mt-4 text-xs text-muted">
              No pedimos registro. Guardamos tu respuesta en una cookie técnica. <Link className="underline" href="/cookies">Política de cookies</Link>
            </p>
          </>
        ) : (
          <>
            <h2 id="age-title" className="mt-3 font-display text-2xl font-bold">Contenido no disponible</h2>
            <p className="mt-3 text-sm text-muted">Este sitio es exclusivo para mayores de 18 años. {COMPLIANCE.noMinors}</p>
            <a className="btn-ghost mt-6" href="https://www.coljuegos.gov.co/" rel="noopener noreferrer">
              Información oficial
            </a>
          </>
        )}
      </div>
    </div>
  );
}
