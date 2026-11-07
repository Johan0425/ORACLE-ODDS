import { apiGet, type League } from '@/lib/api';
import { C, Crest, OG_SIZE, OgFrame, og } from '@/lib/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Clasificación y pronósticos de la liga en ORACLE ODDS';
export const revalidate = 3600;

interface Row {
  rank: number;
  points: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  team: { id: string; name: string; logoUrl: string | null };
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const leagues = await apiGet<League[]>('/leagues', { revalidate: 3600 });
  const league = leagues.ok ? leagues.data.find((l) => l.slug === slug) : undefined;
  const table = league ? await apiGet<Row[]>(`/leagues/${league.id}/standings`, { revalidate: 3600 }) : null;
  const rows = table?.ok ? table.data.slice(0, 5) : [];
  return og(
    <OgFrame eyebrow="Liga">
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <Crest src={league?.logoUrl} name={league?.name ?? 'Liga'} size={110} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, fontFamily: 'Display' }}>{league?.name ?? 'Ligas de fútbol'}</div>
          <div style={{ display: 'flex', fontSize: 28, color: C.muted }}>{[league?.country, league?.season ? `Temporada ${league.season}` : null].filter(Boolean).join(' · ') || 'Resultados, tabla y pronósticos'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, gap: 8 }}>
        {rows.map((r) => (
          <div key={r.team.id} style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 28, borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
            <span style={{ width: 40, color: r.rank === 1 ? C.gold : C.muted, fontWeight: 700 }}>{r.rank}</span>
            <Crest src={r.team.logoUrl} name={r.team.name} size={36} />
            <span style={{ flexGrow: 1 }}>{r.team.name}</span>
            <span style={{ width: 90, color: C.muted, textAlign: 'right' }}>{r.played} PJ</span>
            <span style={{ width: 110, fontWeight: 700, textAlign: 'right' }}>{r.points} pts</span>
          </div>
        ))}
      </div>
    </OgFrame>,
    3600,
  );
}
