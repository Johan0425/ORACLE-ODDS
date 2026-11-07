import { apiGet, type WeekPicks } from './api';
import { formatKickoff } from './format';
import { C, Crest, OgFrame, og, pickText } from './og';

const WEEK_LABEL: Record<number, string> = { [-2]: 'Hace 2 semanas', [-1]: 'Semana pasada', 0: 'Esta semana', 1: 'Próxima semana', 2: 'En 2 semanas', 3: 'En 3 semanas' };

/**
 * Vista previa de pronósticos de una semana: titular, acierto de los destacados
 * ya jugados y hasta 4 pronósticos destacados (los próximos primero).
 */
export async function picksOgImage(offset: number, leagueId?: string | null, title?: string) {
  const qs = new URLSearchParams({ offset: String(offset) });
  if (leagueId) qs.set('leagueId', leagueId);
  const r = await apiGet<WeekPicks>(`/picks/week?${qs}`, { revalidate: 600 });
  const d = r.ok ? r.data : null;
  const leagueName = leagueId && d ? (d.leagues.find((l) => l.id === leagueId)?.name ?? null) : null;
  const featured = d ? d.items.filter((i) => i.featured) : [];
  const upcoming = featured.filter((i) => i.status === 'SCHEDULED');
  // Semana con partidos por jugar: los más próximos. Semana jugada: los de mayor probabilidad, acertados o no.
  const shown = (upcoming.length ? upcoming : [...featured].sort((a, b) => b.featured!.probability - a.featured!.probability)).slice(0, 3);
  const rate = d && d.summary.featured.settled > 0 ? d.summary.featured : null;
  return og(
    <OgFrame eyebrow={WEEK_LABEL[offset] ?? 'Pronósticos'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, lineHeight: 1.05, fontFamily: 'Display' }}>{title ?? 'Pronósticos de fútbol'}</div>
          <div style={{ display: 'flex', fontSize: 28, color: C.muted, marginTop: 8 }}>
            {leagueName ?? (d ? `${d.summary.fixtures} partidos · ${d.leagues.length} ligas` : 'Liga BetPlay, Libertadores, Europa y más')}
          </div>
        </div>
        {rate && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 68, fontWeight: 700, color: C.gold, fontFamily: 'Display' }}>{Math.round((rate.won / rate.settled) * 100)}%</span>
            <span style={{ fontSize: 22, color: C.muted }}>{rate.won}/{rate.settled} destacados acertados</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 30 }}>
        {shown.map((i) => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 18, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, borderRadius: 16, padding: '10px 18px' }}>
            <Crest src={i.homeTeam.logoUrl} name={i.homeTeam.name} size={40} />
            <Crest src={i.awayTeam.logoUrl} name={i.awayTeam.name} size={40} />
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <span style={{ fontSize: 26, fontWeight: 700 }}>{i.homeTeam.name} vs {i.awayTeam.name}</span>
              <span style={{ fontSize: 18, color: C.muted }}>{i.league.name} · {formatKickoff(i.kickoff, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <span style={{ fontSize: 26, color: C.goldSoft, fontWeight: 700 }}>{pickText(i.featured!, i.homeTeam.shortName || i.homeTeam.name, i.awayTeam.shortName || i.awayTeam.name)}</span>
            <span style={{ fontSize: 28, fontWeight: 700, minWidth: 80, textAlign: 'right' }}>{Math.round(i.featured!.probability * 100)}%</span>
            {i.featured!.result && (
              <span style={{ fontSize: 20, fontWeight: 700, color: C.bg, background: i.featured!.result === 'WON' ? C.positive : C.negative, borderRadius: 999, padding: '4px 12px' }}>{i.featured!.result === 'WON' ? 'Acertó' : 'Falló'}</span>
            )}
          </div>
        ))}
        {shown.length === 0 && <div style={{ display: 'flex', fontSize: 30, color: C.muted, marginTop: 40 }}>Probabilidades calibradas con miles de partidos reales.</div>}
      </div>
    </OgFrame>,
  );
}
