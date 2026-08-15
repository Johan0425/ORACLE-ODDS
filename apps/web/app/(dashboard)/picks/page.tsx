import Link from 'next/link';
import type { Metadata } from 'next';
import {
  MARKET_LABEL,
  formatKickoff,
  formatSelection,
  getFixtureProbabilities,
  getFixtures,
  type ApiFixture,
  type ApiProbability,
} from '@/lib/api';

export const metadata: Metadata = { title: 'Picks del día — ORACLE ODDS' };

interface DailyPick {
  fixture: ApiFixture;
  outcome: ApiProbability;
}

const MAX_PICKS = 5;
const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** El outcome de mayor probabilidad de un partido, evitando confianza baja cuando hay alternativa. */
function bestOutcome(probabilities: ApiProbability[]): ApiProbability | undefined {
  const candidates = probabilities.filter((p) => p.confidence !== 'low');
  const pool = candidates.length > 0 ? candidates : probabilities;
  return [...pool].sort((a, b) => b.probability - a.probability)[0];
}

async function loadDailyPicks(): Promise<DailyPick[]> {
  const { items } = await getFixtures({ status: 'SCHEDULED', date: todayIso(), limit: 50 });

  const withOutcome = await Promise.all(
    items.map(async (fixture) => {
      try {
        const outcome = bestOutcome(await getFixtureProbabilities(fixture.id));
        return outcome ? { fixture, outcome } : null;
      } catch {
        return null;
      }
    }),
  );

  return withOutcome
    .filter((p): p is DailyPick => p !== null)
    .sort((a, b) => {
      const confidenceDelta = CONFIDENCE_RANK[b.outcome.confidence] - CONFIDENCE_RANK[a.outcome.confidence];
      return confidenceDelta !== 0 ? confidenceDelta : b.outcome.probability - a.outcome.probability;
    })
    .slice(0, MAX_PICKS);
}

export default async function PicksPage() {
  let picks: DailyPick[] = [];
  try {
    picks = await loadDailyPicks();
  } catch {
    picks = [];
  }

  const combinedProbability = picks.reduce((acc, p) => acc * p.outcome.probability, 1);

  return (
    <main className="min-h-screen bg-background px-6 pb-16 pt-28">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-gold">Conjunto sugerido</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-foreground">Picks del día</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-white/50">
            El pronóstico de mayor probabilidad de cada partido de hoy, priorizando confianza alta. Es la lectura
            del modelo, no una recomendación de apuesta.
          </p>
        </header>

        {picks.length === 0 ? (
          <p className="text-center text-sm text-white/50">Sin picks disponibles todavía.</p>
        ) : (
          <>
            <div className="mb-8 rounded-2xl border border-gold/30 bg-gold/5 p-6 text-center">
              <p className="text-xs uppercase tracking-widest text-white/50">
                Probabilidad combinada ({picks.length} {picks.length === 1 ? 'pick' : 'picks'})
              </p>
              <p className="mt-2 font-display text-4xl font-bold text-gold">
                {(combinedProbability * 100).toFixed(1)}%
              </p>
              <p className="mt-2 text-xs text-white/40">
                Producto de las probabilidades individuales — asume independencia entre partidos, no es una garantía.
              </p>
            </div>

            <ol className="space-y-4">
              {picks.map(({ fixture, outcome }, index) => (
                <li key={fixture.id}>
                  <Link
                    href={`/matches/${fixture.id}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-surface/60 p-5 transition-colors hover:border-gold/30"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-display text-lg font-bold text-white/30">#{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {fixture.homeTeam.name} vs {fixture.awayTeam.name}
                        </p>
                        <p className="text-xs text-white/40">
                          {fixture.league.name} · {formatKickoff(fixture.kickoff)}
                        </p>
                        <p className="mt-1 text-xs text-gold">
                          {MARKET_LABEL[outcome.market] ?? outcome.market} · {formatSelection(outcome)}
                        </p>
                      </div>
                    </div>
                    <span className="font-display text-2xl font-bold text-foreground">
                      {Math.round(outcome.probability * 100)}%
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </main>
  );
}
