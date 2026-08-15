import Link from 'next/link';
import type { Metadata } from 'next';
import { MatchCard } from '@/components/match/MatchCard';
import {
  MARKET_LABEL,
  formatKickoff,
  formatSelection,
  getFixtureProbabilities,
  getFixtures,
  type ApiFixture,
  type ApiProbability,
} from '@/lib/api';

export const metadata: Metadata = { title: 'Partidos de hoy — ORACLE ODDS' };

interface MatchWithTopPick {
  fixture: ApiFixture;
  top?: ApiProbability;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** El "favorito" de 1X2 (mayor probabilidad entre local/empate/visitante) para el resumen de la tarjeta. */
function pickHeadline(probabilities: ApiProbability[]): ApiProbability | undefined {
  return probabilities
    .filter((p) => p.market === 'MONEYLINE_1X2')
    .sort((a, b) => b.probability - a.probability)[0];
}

async function loadTodaysMatches(): Promise<MatchWithTopPick[]> {
  const { items } = await getFixtures({ status: 'SCHEDULED', date: todayIso(), limit: 50 });

  return Promise.all(
    items.map(async (fixture) => {
      try {
        const probabilities = await getFixtureProbabilities(fixture.id);
        return { fixture, top: pickHeadline(probabilities) };
      } catch {
        return { fixture, top: undefined };
      }
    }),
  );
}

export default async function MatchesPage() {
  let matches: MatchWithTopPick[] = [];
  try {
    matches = await loadTodaysMatches();
  } catch {
    matches = [];
  }

  const byLeague = new Map<string, MatchWithTopPick[]>();
  for (const match of matches) {
    const key = match.fixture.league.name;
    byLeague.set(key, [...(byLeague.get(key) ?? []), match]);
  }

  return (
    <main className="min-h-screen bg-background px-6 pb-16 pt-28">
      <div className="mx-auto max-w-6xl">
        <header className="mb-12">
          <p className="text-xs uppercase tracking-[0.4em] text-gold">Barrido diario</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-foreground">Partidos de hoy</h1>
          <p className="mt-2 text-sm text-white/50">
            {matches.length > 0
              ? `${matches.length} partidos con probabilidad calculada — toca uno para ver el desglose completo.`
              : 'Cargando el barrido del día...'}
          </p>
        </header>

        {matches.length === 0 && (
          <p className="text-sm text-white/50">
            Sin partidos sincronizados para hoy todavía. Corre <code className="text-white/70">node prisma/seed.js</code> en{' '}
            <code className="text-white/70">apps/api</code> para sembrar el barrido diario.
          </p>
        )}

        {[...byLeague.entries()].map(([leagueName, leagueMatches]) => (
          <section key={leagueName} className="mb-14">
            <h2 className="mb-5 font-display text-xl font-bold text-foreground">{leagueName}</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {leagueMatches.map(({ fixture, top }) => (
                <Link key={fixture.id} href={`/matches/${fixture.id}`} className="block">
                  <MatchCard
                    homeTeam={fixture.homeTeam.name}
                    awayTeam={fixture.awayTeam.name}
                    leagueName={leagueName}
                    kickoff={formatKickoff(fixture.kickoff)}
                    market={top ? (MARKET_LABEL[top.market] ?? top.market) : '1X2'}
                    selection={top ? formatSelection(top) : 'Sin datos suficientes'}
                    probability={top?.probability ?? 0}
                    confidence={top?.confidence ?? 'low'}
                  />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
