import Link from 'next/link';
import { CinematicHero } from '@/components/hero/CinematicHero';
import { MatchCard } from '@/components/match/MatchCard';
import { getFeaturedMatch } from '@/lib/api';

export default async function LandingPage() {
  const featured = await getFeaturedMatch();

  return (
    <main>
      <CinematicHero />

      <section className="mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-24">
        <h2 className="text-center font-display text-3xl font-bold text-foreground sm:text-4xl">
          Probabilidad calculada, no solo una cuota
        </h2>

        {featured ? (
          <MatchCard
            homeTeam={featured.homeTeam}
            awayTeam={featured.awayTeam}
            leagueName={featured.leagueName}
            kickoff={featured.kickoff}
            market={featured.market}
            selection={featured.selection}
            probability={featured.probability}
            confidence={featured.confidence}
          />
        ) : (
          <p className="max-w-md text-center text-sm text-white/50">
            Sin partidos sincronizados todavía. Levanta la API (
            <code className="text-white/70">apps/api</code>) y siembra datos con{' '}
            <code className="text-white/70">node prisma/seed.js</code> para ver una probabilidad real aquí.
          </p>
        )}

        <Link
          href="/matches"
          className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-6 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/20"
        >
          Ver el barrido de partidos de hoy →
        </Link>
      </section>
    </main>
  );
}
