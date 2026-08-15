import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MarketBreakdown } from '@/components/match/MarketBreakdown';
import { FormBadges } from '@/components/match/FormBadges';
import {
  formatKickoff,
  getFixtureDetail,
  getFixtureProbabilities,
  getH2H,
  getTeamForm,
  getTeamStats,
  type ApiProbability,
  type ApiTeamForm,
  type ApiTeamStats,
} from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

const MARKET_TITLES: Record<string, string> = {
  MONEYLINE_1X2: 'Resultado (1X2)',
  OVER_UNDER_GOALS: 'Total de goles (Over/Under)',
  ASIAN_HANDICAP: 'Hándicap asiático',
};

function groupByMarket(probabilities: ApiProbability[]): Map<string, ApiProbability[]> {
  const groups = new Map<string, ApiProbability[]>();
  for (const p of probabilities) {
    groups.set(p.market, [...(groups.get(p.market) ?? []), p]);
  }
  return groups;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const fixture = await getFixtureDetail(id);
    return { title: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — ORACLE ODDS` };
  } catch {
    return { title: 'Partido — ORACLE ODDS' };
  }
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { id } = await params;

  const fixture = await getFixtureDetail(id).catch(() => null);
  if (!fixture) notFound();

  const [probabilities, homeForm, awayForm, homeStats, awayStats, h2h] = await Promise.all([
    getFixtureProbabilities(id).catch(() => []),
    getTeamForm(fixture.homeTeam.id).catch(() => []),
    getTeamForm(fixture.awayTeam.id).catch(() => []),
    getTeamStats(fixture.homeTeam.id).catch(() => null),
    getTeamStats(fixture.awayTeam.id).catch(() => null),
    getH2H(fixture.homeTeam.id, fixture.awayTeam.id).catch(() => []),
  ]);

  const marketGroups = groupByMarket(probabilities);

  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <Link href="/matches" className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70">
          ← Partidos de hoy
        </Link>

        <header className="mb-10 mt-4 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-gold">{fixture.league.name}</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-foreground sm:text-4xl">
            {fixture.homeTeam.name} <span className="text-white/30">vs</span> {fixture.awayTeam.name}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            {formatKickoff(fixture.kickoff)}
            {fixture.venue ? ` · ${fixture.venue}` : ''}
          </p>
        </header>

        <section className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <TeamSupportCard name={fixture.homeTeam.name} form={homeForm} stats={homeStats} />
          <TeamSupportCard name={fixture.awayTeam.name} form={awayForm} stats={awayStats} />
        </section>

        {h2h.length > 0 && (
          <section className="mb-12 rounded-2xl border border-white/10 bg-surface/60 p-6">
            <h2 className="mb-4 font-display text-lg font-bold text-foreground">Head to head</h2>
            <ul className="space-y-2 text-sm text-white/60">
              {h2h.map((match) => (
                <li
                  key={match.fixtureId}
                  className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0"
                >
                  <span>{formatKickoff(match.kickoff)}</span>
                  <span className="font-semibold text-foreground">
                    {match.homeScore ?? '–'} - {match.awayScore ?? '–'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[...marketGroups.entries()].map(([market, outcomes]) => (
            <MarketBreakdown key={market} title={MARKET_TITLES[market] ?? market} outcomes={outcomes} />
          ))}
        </section>

        {marketGroups.size === 0 && (
          <p className="text-center text-sm text-white/50">
            Todavía no hay suficiente historial para calcular probabilidades de este partido.
          </p>
        )}
      </div>
    </main>
  );
}

function TeamSupportCard({
  name,
  form,
  stats,
}: {
  name: string;
  form: ApiTeamForm[];
  stats: ApiTeamStats | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/60 p-6">
      <h3 className="font-display text-lg font-bold text-foreground">{name}</h3>

      {form.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs uppercase tracking-widest text-white/40">Forma reciente</p>
          <FormBadges form={form} />
        </div>
      )}

      {stats && stats.sampleSize > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <Stat label="Goles a favor" value={stats.avgGoalsFor.toFixed(1)} />
          <Stat label="Goles en contra" value={stats.avgGoalsAgainst.toFixed(1)} />
          <Stat label="Córners" value={stats.avgCorners.toFixed(1)} />
          <Stat label="Tarjetas" value={stats.avgCards.toFixed(1)} />
        </dl>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="font-display text-xl font-bold text-foreground">{value}</dd>
    </div>
  );
}
