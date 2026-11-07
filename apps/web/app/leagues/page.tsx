import type { Metadata } from 'next';
import Link from 'next/link';
import { apiGet, type League } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { DataUnavailable, EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Ligas', description: 'Competiciones con partidos, resultados, clasificación y pronósticos actualizados.', alternates: { canonical: '/leagues' } };
export const revalidate = 600;

/** Orden de países: Colombia y Sudamérica primero, luego Europa y el resto. */
const COUNTRY_ORDER = ['Colombia', 'Sudamérica', 'Europa', 'Inglaterra', 'España', 'Italia', 'Alemania', 'Francia', 'Portugal', 'Países Bajos', 'Argentina', 'Brasil', 'México', 'Estados Unidos', 'Ecuador'];

export default async function LeaguesPage() {
  const res = await apiGet<League[]>('/leagues', { revalidate: 600 });
  if (!res.ok) return <DataUnavailable error={res.error} />;
  const byCountry = new Map<string, League[]>();
  for (const l of res.data) byCountry.set(l.country ?? 'Otras', [...(byCountry.get(l.country ?? 'Otras') ?? []), l]);
  const rank = (c: string) => (COUNTRY_ORDER.includes(c) ? COUNTRY_ORDER.indexOf(c) : 99);
  const countries = [...byCountry.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return (
    <>
      <PageHeader eyebrow="Competiciones" title="Ligas">Resultados, próximos partidos, clasificación y pronósticos de cada competición.</PageHeader>
      {countries.length === 0 ? (
        <EmptyState title="Sin competiciones sincronizadas todavía" />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <section key={c} className="card p-4" aria-label={c}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{c}</h2>
              <ul className="mt-3 grid gap-1">
                {byCountry.get(c)!.map((l) => (
                  <li key={l.id}>
                    <Link href={`/leagues/${l.slug}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
                      <TeamLogo name={l.name} src={l.logoUrl} size={24} />
                      <span className="text-sm">{l.name}</span>
                      {l.season && <span className="ml-auto text-xs text-muted">{l.season}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
