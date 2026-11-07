import { apiGet, type WeekPick } from '@/lib/api';
import { formatKickoff } from '@/lib/format';
import { C, Crest, OG_SIZE, OgFrame, ProbBar, og, pickText } from '@/lib/og';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Pronóstico del partido en ORACLE ODDS';
export const revalidate = 600;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await apiGet<WeekPick>(`/picks/fixture/${encodeURIComponent(id)}`, { revalidate: 600 });
  if (!r.ok) {
    return og(
      <OgFrame eyebrow="Pronóstico">
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, marginTop: 80 }}>Pronósticos de fútbol con estadística</div>
      </OgFrame>,
    );
  }
  const m = r.data;
  const p = m.prediction?.oneXTwo;
  const finished = m.status === 'FINISHED' && m.homeScore != null && m.awayScore != null;
  const live = m.status === 'LIVE';
  const feat = m.featured ?? [...m.picks].sort((a, b) => b.probability - a.probability)[0] ?? null;
  const team = (name: string, logo: string | null) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 330, gap: 14 }}>
      <Crest src={logo} name={name} size={128} />
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, textAlign: 'center', justifyContent: 'center', lineHeight: 1.1 }}>{name}</div>
    </div>
  );
  return og(
    <OgFrame eyebrow={finished ? 'Resultado' : live ? 'En vivo' : 'Pronóstico'}>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: 24, color: C.gold, letterSpacing: 2, textTransform: 'uppercase' }}>
        {m.league.name}
        {m.league.country ? ` · ${m.league.country}` : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        {team(m.homeTeam.name, m.homeTeam.logoUrl)}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {finished || live ? (
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, fontFamily: 'Display' }}>{m.homeScore} - {m.awayScore}</div>
          ) : (
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: C.muted, fontFamily: 'Display' }}>VS</div>
          )}
          <div style={{ display: 'flex', fontSize: 24, color: C.muted }}>{formatKickoff(m.kickoff, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        {team(m.awayTeam.name, m.awayTeam.logoUrl)}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 'auto', marginBottom: 22, gap: 40 }}>
        {p?.HOME != null && p.DRAW != null && p.AWAY != null ? <ProbBar home={p.HOME} draw={p.DRAW} away={p.AWAY} width={560} /> : <div style={{ display: 'flex' }} />}
        {feat && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              background: 'rgba(217,180,74,0.12)',
              border: `2px solid ${feat.result === 'WON' ? C.positive : feat.result === 'LOST' ? C.negative : 'rgba(217,180,74,0.6)'}`,
              borderRadius: 20,
              padding: '14px 24px',
            }}
          >
            <span style={{ fontSize: 20, color: C.muted, textTransform: 'uppercase', letterSpacing: 2 }}>
              {feat.result === 'WON' ? 'Acertado' : feat.result === 'LOST' ? 'Fallado' : 'Pronóstico del modelo'}
            </span>
            <span style={{ display: 'flex', gap: 16, fontSize: 38, fontWeight: 700, color: C.goldSoft }}>
              <span>{pickText(feat, m.homeTeam.name, m.awayTeam.name)}</span>
              <span style={{ color: C.fg }}>{Math.round(feat.probability * 100)}%</span>
            </span>
          </div>
        )}
      </div>
    </OgFrame>,
    finished ? 86_400 : 600,
  );
}
