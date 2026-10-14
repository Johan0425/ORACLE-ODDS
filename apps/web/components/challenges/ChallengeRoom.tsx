'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, PUBLIC_API_URL } from '@/lib/api';
import { formatKickoff, selectionName } from '@/lib/format';
import { MY_CHALLENGES_KEY, participantKey, readLocal, writeLocal, type MyChallenge } from '@/lib/local';

export interface ChallengeView {
  publicCode: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'LOCKED' | 'CLOSED' | 'ARCHIVED';
  startsAt: string;
  endsAt: string;
  scoringRules: { system: string; format: string; allowedMarkets: string[] };
  maxParticipants: number;
  participants: number;
  flagged: boolean;
  fixtures: Array<{ id: string; kickoff: string; status: string; homeTeam: { name: string }; awayTeam: { name: string }; league: { name: string }; homeScore: number | null; awayScore: number | null; locked: boolean }>;
  leaderboard: Array<{ rank: number; alias: string; score: number; picks: Array<{ fixtureId: string; marketKey: string; selectionKey: string; line: number | null; outcome?: string | null }> }>;
  disclaimer: string;
}

type Pick = { fixtureId: string; marketKey: string; selectionKey: string; line: number | null };
const OPTIONS: Record<string, Array<{ selectionKey: string; line: number | null }>> = {
  '1X2': [{ selectionKey: 'HOME', line: null }, { selectionKey: 'DRAW', line: null }, { selectionKey: 'AWAY', line: null }],
  OU_GOALS: [{ selectionKey: 'OVER', line: 2.5 }, { selectionKey: 'UNDER', line: 2.5 }],
  BTTS: [{ selectionKey: 'YES', line: null }, { selectionKey: 'NO', line: null }],
  DC: [{ selectionKey: 'HOME_DRAW', line: null }, { selectionKey: 'HOME_AWAY', line: null }, { selectionKey: 'DRAW_AWAY', line: null }],
};
const OUTCOME_STYLE: Record<string, string> = { WIN: 'text-positive', HALF_WIN: 'text-positive', LOSS: 'text-negative', HALF_LOSS: 'text-negative' };

export function ChallengeRoom({ initial }: { initial: ChallengeView }) {
  const code = initial.publicCode;
  const [c, setC] = useState(initial);
  const [token, setToken] = useState<string | null>(null);
  const [alias, setAlias] = useState('');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [creatorSecret, setCreatorSecret] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await apiGet<ChallengeView>(`/challenges/${code}`);
    if (r.ok) setC(r.data);
  }, [code]);

  useEffect(() => {
    const t = readLocal<string | null>(participantKey(code), null);
    setToken(t);
    setCreatorSecret(readLocal<MyChallenge[]>(MY_CHALLENGES_KEY, []).find((m) => m.code === code)?.secret ?? null);
    if (t) {
      fetch(`${PUBLIC_API_URL}/challenges/${code}/me`, { headers: { 'x-participant-token': t } })
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { data?: { alias: string; selections: Pick[] } } | null) => {
          if (!b?.data) return;
          setAlias(b.data.alias);
          setPicks(Object.fromEntries(b.data.selections.map((p) => [`${p.fixtureId}|${p.marketKey}`, p])));
        })
        .catch(() => undefined);
    }
  }, [code]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await apiPost<{ participantToken: string; alias: string }>(`/challenges/${code}/join`, { alias });
    if (!r.ok) return setMsg({ kind: 'err', text: r.error });
    writeLocal(participantKey(code), r.data.participantToken);
    setToken(r.data.participantToken);
    setMsg({ kind: 'ok', text: `Te uniste como ${r.data.alias}. Tu acceso queda guardado en este navegador.` });
    void refresh();
  };

  const save = async () => {
    if (!token) return;
    const open = Object.values(picks).filter((p) => !c.fixtures.find((f) => f.id === p.fixtureId)?.locked);
    const r = await apiPost(`/challenges/${code}/picks`, { picks: open }, { 'x-participant-token': token });
    setMsg(r.ok ? { kind: 'ok', text: 'Selecciones guardadas. Se bloquean al inicio de cada partido.' } : { kind: 'err', text: r.error });
    if (r.ok) void refresh();
  };

  const creatorAction = async (path: string, body: unknown = {}) => {
    if (!creatorSecret) return;
    const r = await apiPost(`/challenges/${code}/${path}`, body, { 'x-creator-secret': creatorSecret });
    setMsg(r.ok ? { kind: 'ok', text: 'Acción aplicada.' } : { kind: 'err', text: r.error });
    void refresh();
  };

  const report = async () => {
    const reason = window.prompt('¿Qué problema encontraste? (contenido ofensivo, spam, dinero real…)');
    if (!reason) return;
    const r = await apiPost(`/challenges/${code}/report`, { reason });
    setMsg(r.ok ? { kind: 'ok', text: 'Gracias, revisaremos el reporte.' } : { kind: 'err', text: r.error });
  };

  const markets = c.scoringRules.allowedMarkets.filter((m) => OPTIONS[m]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label="Partidos y selecciones" className="space-y-4">
        {c.flagged && <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-warning">Este reto recibió varios reportes y está en revisión.</p>}
        {!token && c.status === 'OPEN' && (
          <form onSubmit={join} className="card flex flex-wrap items-end gap-3 p-4" aria-label="Unirse al reto">
            <label className="flex-1 text-sm">
              Elige un alias (sin datos personales)
              <input className="input mt-1" required minLength={3} maxLength={20} pattern="[\p{L}\p{N}_ .\-]{3,20}" value={alias} onChange={(e) => setAlias(e.target.value)} data-testid="alias-input" />
            </label>
            <button className="btn-primary" type="submit" data-testid="join-submit">Unirme</button>
          </form>
        )}
        <ul className="space-y-3">
          {c.fixtures.map((f) => (
            <li key={f.id} className="card p-4" data-testid="challenge-fixture">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{f.homeTeam.name} vs {f.awayTeam.name}</p>
                  <p className="text-xs text-muted">{f.league.name} · {formatKickoff(f.kickoff)}</p>
                </div>
                {f.homeScore != null ? <span className="tabular font-bold">{f.homeScore} – {f.awayScore}</span> : f.locked ? <span className="chip">Bloqueado</span> : null}
              </div>
              {token && (
                <div className="mt-3 space-y-2">
                  {markets.map((m) => (
                    <div key={m} role="radiogroup" aria-label={m} className="flex flex-wrap gap-2">
                      {OPTIONS[m].map((o) => {
                        const key = `${f.id}|${m}`;
                        const active = picks[key]?.selectionKey === o.selectionKey;
                        return (
                          <button
                            key={o.selectionKey}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={f.locked}
                            onClick={() => setPicks((p) => ({ ...p, [key]: { fixtureId: f.id, marketKey: m, selectionKey: o.selectionKey, line: o.line } }))}
                            className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-gold bg-gold/15 text-gold-soft' : 'border-line text-muted hover:text-foreground'} disabled:opacity-50`}
                          >
                            {selectionName(m, o.selectionKey, o.line, f.homeTeam.name, f.awayTeam.name)}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        {token && c.status === 'OPEN' && (
          <button type="button" className="btn-primary" onClick={save} data-testid="picks-save">Guardar selecciones</button>
        )}
        {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`text-sm ${msg.kind === 'err' ? 'text-negative' : 'text-positive'}`}>{msg.text}</p>}
      </section>

      <aside className="space-y-4">
        <section className="card p-4" aria-labelledby="lb-title">
          <div className="flex items-center justify-between">
            <h2 id="lb-title" className="font-semibold">Clasificación</h2>
            <button type="button" className="text-xs text-muted underline" onClick={refresh}>Actualizar</button>
          </div>
          {c.leaderboard.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Aún no hay participantes.</p>
          ) : (
            <ol className="tabular mt-2 space-y-1 text-sm" data-testid="leaderboard">
              {c.leaderboard.map((e) => (
                <li key={e.alias} className="flex justify-between gap-2">
                  <span><span className="text-muted">{e.rank}.</span> {e.alias}</span>
                  <span className="font-bold">
                    {e.score}
                    {e.picks.some((p) => p.outcome) && (
                      <span className="ml-2 text-xs font-normal">
                        {e.picks.filter((p) => p.outcome).map((p, i) => <span key={i} className={OUTCOME_STYLE[p.outcome!] ?? 'text-muted'}>●</span>)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-muted">Las selecciones de cada participante se muestran cuando su partido comienza.</p>
        </section>
        {creatorSecret && (
          <section className="card space-y-2 p-4" aria-label="Panel del creador">
            <h2 className="font-semibold">Panel del creador</h2>
            <button type="button" className="btn-ghost w-full" onClick={() => creatorAction('close')} disabled={c.status !== 'OPEN' && c.status !== 'LOCKED'}>Cerrar reto</button>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const a = (e.currentTarget.elements.namedItem('hide') as HTMLInputElement).value; void creatorAction('moderate', { alias: a, hidden: true }); }}>
              <input name="hide" className="input" placeholder="Alias a ocultar" maxLength={20} />
              <button className="btn-ghost" type="submit">Ocultar</button>
            </form>
          </section>
        )}
        <button type="button" onClick={report} className="text-xs text-muted underline">Reportar contenido</button>
      </aside>
    </div>
  );
}
