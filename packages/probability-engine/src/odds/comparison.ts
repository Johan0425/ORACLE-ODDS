import { removeVig, type VigRemovalMethod } from './vig';

export interface BookQuote {
  bookmaker: string;
  selection: string;
  price: number;
  capturedAt?: Date;
}

export interface SelectionComparison {
  selection: string;
  best: { bookmaker: string; price: number } | null;
  average: number | null;
  quotes: Array<{ bookmaker: string; price: number; diffVsAverage: number }>;
}

/** Agrupa cotizaciones por selección y calcula mejor precio, promedio y diferencia porcentual frente al promedio. */
export function compareQuotes(quotes: BookQuote[]): SelectionComparison[] {
  const bySelection = new Map<string, BookQuote[]>();
  for (const q of quotes) bySelection.set(q.selection, [...(bySelection.get(q.selection) ?? []), q]);

  return [...bySelection.entries()].map(([selection, list]) => {
    const average = list.reduce((s, q) => s + q.price, 0) / list.length;
    const sorted = [...list].sort((a, b) => b.price - a.price);
    return {
      selection,
      best: sorted[0] ? { bookmaker: sorted[0].bookmaker, price: sorted[0].price } : null,
      average,
      quotes: sorted.map((q) => ({ bookmaker: q.bookmaker, price: q.price, diffVsAverage: q.price / average - 1 })),
    };
  });
}

/**
 * Probabilidad de consenso sin margen: se quita el vig libro por libro (solo
 * casas con el libro completo) y se promedia. Es un feature del modelo y la
 * referencia para el edge, nunca el resultado copiado.
 */
export function consensusNoVig(
  quotes: BookQuote[],
  selections: readonly string[],
  method: VigRemovalMethod = 'power',
): { probabilities: Record<string, number>; books: number; avgOverround: number } | null {
  const byBook = new Map<string, Map<string, number>>();
  for (const q of quotes) {
    const book = byBook.get(q.bookmaker) ?? new Map<string, number>();
    book.set(q.selection, q.price);
    byBook.set(q.bookmaker, book);
  }

  const sums: Record<string, number> = Object.fromEntries(selections.map((s) => [s, 0]));
  let books = 0;
  let overroundSum = 0;
  for (const prices of byBook.values()) {
    if (!selections.every((s) => prices.has(s))) continue;
    const result = removeVig(selections.map((s) => prices.get(s)!), method);
    selections.forEach((s, i) => (sums[s] += result.probabilities[i]));
    overroundSum += result.overround;
    books += 1;
  }
  if (books === 0) return null;
  return {
    probabilities: Object.fromEntries(selections.map((s) => [s, sums[s] / books])),
    books,
    avgOverround: overroundSum / books,
  };
}
