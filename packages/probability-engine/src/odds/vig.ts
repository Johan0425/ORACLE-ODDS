import { assertValidDecimalOdds } from './conversion';

export type VigRemovalMethod = 'proportional' | 'power' | 'shin';

export interface VigRemovalResult {
  method: VigRemovalMethod;
  /** Suma de probabilidades implícitas brutas (1.05 = 5% de margen). */
  overround: number;
  /** Probabilidades sin margen, en el mismo orden que las cuotas de entrada; suman 1. */
  probabilities: number[];
  /** Solo para Shin: proporción estimada de dinero informado. */
  shinZ?: number;
}

/** Suma de 1/cuota de un libro completo. */
export function overround(decimalOdds: number[]): number {
  decimalOdds.forEach(assertValidDecimalOdds);
  return decimalOdds.reduce((sum, o) => sum + 1 / o, 0);
}

function proportional(raw: number[], book: number): number[] {
  return raw.map((p) => p / book);
}

/**
 * Método de potencia: encuentra k tal que Σ (1/o_i)^k = 1. Asigna más margen a
 * los underdogs que el proporcional, lo que corrige parcialmente el sesgo
 * favorito-underdog observado en mercados de fútbol.
 */
function power(raw: number[]): number[] {
  let lo = 1;
  let hi = 10;
  const total = (k: number) => raw.reduce((s, p) => s + p ** k, 0);
  // Si el libro tiene overround < 1 (arbitraje), k < 1.
  if (total(1) < 1) {
    lo = 0.01;
    hi = 1;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > 1) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  const probs = raw.map((p) => p ** k);
  const sum = probs.reduce((s, p) => s + p, 0);
  return probs.map((p) => p / sum);
}

/**
 * Método de Shin (1993): modela una fracción z de apostadores con información
 * privilegiada. Se resuelve z por bisección para que las probabilidades sumen 1.
 * Recomendado para mercados de 2-3 vías con margen moderado.
 */
function shin(raw: number[], book: number): { probabilities: number[]; z: number } {
  const probsFor = (z: number) =>
    raw.map((q) => (Math.sqrt(z * z + (4 * (1 - z) * q * q) / book) - z) / (2 * (1 - z)));
  const sumFor = (z: number) => probsFor(z).reduce((s, p) => s + p, 0);

  if (book <= 1) {
    return { probabilities: proportional(raw, book), z: 0 };
  }

  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (sumFor(mid) > 1) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  const probs = probsFor(z);
  const sum = probs.reduce((s, p) => s + p, 0);
  return { probabilities: probs.map((p) => p / sum), z };
}

/** Quita el margen de un libro completo (todas las selecciones de un mismo mercado y línea). */
export function removeVig(decimalOdds: number[], method: VigRemovalMethod = 'power'): VigRemovalResult {
  if (decimalOdds.length < 2) throw new RangeError('Se necesitan al menos 2 selecciones para quitar el margen');
  const book = overround(decimalOdds);
  const raw = decimalOdds.map((o) => 1 / o);

  switch (method) {
    case 'proportional':
      return { method, overround: book, probabilities: proportional(raw, book) };
    case 'power':
      return { method, overround: book, probabilities: power(raw) };
    case 'shin': {
      const result = shin(raw, book);
      return { method, overround: book, probabilities: result.probabilities, shinZ: result.z };
    }
  }
}
