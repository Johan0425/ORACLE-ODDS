/**
 * Normalización de nombres para *ayudar* a emparejar entidades entre
 * proveedores. Nunca se usa como única clave: siempre se combina con deporte,
 * competición y ventana horaria (ver fixture-matching.ts).
 */

const STOP_TOKENS = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'club', 'de', 'the', 'ud', 'sd', 'ca', 'fk', 'sk', 'if', 'bk', 'calcio', 'football', 'futbol', 'deportivo']);

const ALIASES: Record<string, string> = {
  utd: 'united',
  'man utd': 'manchester united',
  'man united': 'manchester united',
  'man city': 'manchester city',
  spurs: 'tottenham hotspur',
  inter: 'internazionale',
  'inter milan': 'internazionale',
  psg: 'paris saint germain',
  'paris sg': 'paris saint germain',
  wolves: 'wolverhampton wanderers',
  'atletico madrid': 'atletico madrid',
  'athletic bilbao': 'athletic club',
  'bayern munich': 'bayern munchen',
  'bayern münchen': 'bayern munchen',
};

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeName(name: string): string {
  let s = stripAccents(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALIASES[s]) s = ALIASES[s];
  const tokens = s.split(' ').filter((t) => t && !STOP_TOKENS.has(t)).map((t) => ALIASES[t] ?? t);
  return tokens.join(' ') || s;
}

export function slugify(input: string): string {
  return stripAccents(input).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function bigrams(s: string): string[] {
  const clean = s.replace(/\s+/g, ' ');
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) out.push(clean.slice(i, i + 2));
  return out;
}

/** Similitud 0..1: máximo entre coeficiente de Dice sobre bigramas y contención de tokens. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let overlap = 0;
  for (const g of bb) {
    const c = counts.get(g) ?? 0;
    if (c > 0) {
      overlap += 1;
      counts.set(g, c - 1);
    }
  }
  const dice = ba.length + bb.length > 0 ? (2 * overlap) / (ba.length + bb.length) : 0;
  const ta = [...new Set(na.split(' '))];
  const tb = [...new Set(nb.split(' '))];
  // Un token "coincide" si es igual o uno es prefijo del otro (≥ 3 letras): "dep" ~ "deportivo".
  const matches = (t: string, others: string[]) => others.some((o) => o === t || (Math.min(o.length, t.length) >= 3 && (o.startsWith(t) || t.startsWith(o))));
  const onlyA = ta.filter((t) => !matches(t, tb));
  const onlyB = tb.filter((t) => !matches(t, ta));
  const inter = ta.length - onlyA.length;
  const containment = inter / Math.min(ta.length, tb.length);
  const base = Math.max(dice, containment * 0.95);
  // Ambos nombres tienen tokens propios ("manchester united" vs "manchester city"): equipos probablemente distintos.
  return onlyA.length > 0 && onlyB.length > 0 ? base * 0.8 : base;
}
