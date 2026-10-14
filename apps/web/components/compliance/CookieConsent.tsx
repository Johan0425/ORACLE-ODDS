'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const KEY = 'oo_cookie_choice';

/**
 * Solo usamos cookies técnicas (edad declarada) y almacenamiento local del
 * Bet Slip/retos. No hay analítica de terceros activada por defecto; si se
 * añade, debe respetar esta elección.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(!window.localStorage.getItem(KEY));
    } catch {
      setVisible(false);
    }
  }, []);
  if (!visible) return null;
  const choose = (value: 'essential' | 'analytics') => {
    try {
      window.localStorage.setItem(KEY, value);
    } catch {
      /* sin almacenamiento: se vuelve a preguntar */
    }
    setVisible(false);
  };
  return (
    <div role="region" aria-label="Preferencias de cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-line bg-surface-2/95 p-4 text-sm shadow-2xl backdrop-blur sm:inset-x-6">
      <p className="text-muted">
        Usamos cookies y almacenamiento local estrictamente necesarios (verificación de edad, tu Bet Slip y retos). La analítica, si se habilita, es respetuosa de la privacidad y opcional.{' '}
        <Link href="/cookies" className="underline">Más información</Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => choose('essential')}>
          Solo necesarias
        </button>
        <button type="button" className="btn-ghost" onClick={() => choose('analytics')}>
          Aceptar analítica anónima
        </button>
      </div>
    </div>
  );
}
