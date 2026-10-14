'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiPost, type Fixture } from '@/lib/api';
import { formatKickoff } from '@/lib/format';
import { MY_CHALLENGES_KEY, readLocal, writeLocal, type MyChallenge } from '@/lib/local';

const SYSTEMS = [
  ['simple', 'Acierto simple (1 punto por acierto)'],
  ['weighted', 'Ponderado por dificultad (cuota de referencia)'],
  ['virtual_units', 'Unidades virtuales (1 u por pick)'],
  ['survivor', 'Survivor (eliminado al primer fallo)'],
  ['elimination', 'Eliminación (dos vidas)'],
  ['quiniela', 'Quiniela (solo 1X2)'],
] as const;
const FORMATS = [
  ['one_off', 'Reto único'],
  ['weekly', 'Reto semanal'],
  ['private_league', 'Liga privada'],
] as const;
const MARKETS = [
  ['1X2', 'Resultado (1X2)'],
  ['OU_GOALS', 'Más/Menos goles'],
  ['BTTS', 'Ambos marcan'],
  ['DC', 'Doble oportunidad'],
] as const;

export function ChallengeBuilder({ fixtures }: { fixtures: Fixture[] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [system, setSystem] = useState<(typeof SYSTEMS)[number][0]>('simple');
  const [format, setFormat] = useState<(typeof FORMATS)[number][0]>('one_off');
  const [markets, setMarkets] = useState<string[]>(['1X2']);
  const [maxParticipants, setMaxParticipants] = useState(50);
  const [withSponsor, setWithSponsor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MyChallenge | null>(null);
  const [mine, setMine] = useState<MyChallenge[]>([]);
  useEffect(() => setMine(readLocal<MyChallenge[]>(MY_CHALLENGES_KEY, [])), []);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await apiPost<{ publicCode: string; creatorSecret: string }>('/challenges', {
      title,
      description: description || undefined,
      fixtureIds: selected,
      scoring: { system, format, allowedMarkets: system === 'quiniela' ? ['1X2'] : markets },
      maxParticipants,
      withSponsor,
    });
    if (!r.ok) return setError(r.error);
    const entry: MyChallenge = { code: r.data.publicCode, title, secret: r.data.creatorSecret, createdAt: new Date().toISOString() };
    const next = [entry, ...readLocal<MyChallenge[]>(MY_CHALLENGES_KEY, [])].slice(0, 30);
    writeLocal(MY_CHALLENGES_KEY, next);
    setMine(next);
    setCreated(entry);
  };

  if (created) {
    return (
      <div className="card space-y-4 border-gold/40 p-6" role="status" data-testid="challenge-created">
        <h2 className="font-display text-xl font-bold">Reto creado</h2>
        <p className="text-sm">
          Código público: <strong className="tabular text-gold-soft" data-testid="challenge-code">{created.code}</strong>
        </p>
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-semibold text-warning">Secreto de creador — se muestra una sola vez</p>
          <code className="mt-2 block break-all text-xs">{created.secret}</code>
          <p className="mt-2 text-xs text-muted">Lo guardamos en este navegador para que puedas cerrar o moderar el reto. Si cambias de dispositivo, cópialo ahora: no podemos recuperarlo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/challenge/${created.code}`} className="btn-primary">Ir al reto</Link>
          <button type="button" className="btn-ghost" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/challenge/${created.code}`)}>Copiar enlace</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <form onSubmit={submit} className="card space-y-5 p-5" aria-label="Crear reto">
        <label className="block text-sm">
          Nombre del reto
          <input className="input mt-1" required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reto de la oficina" />
        </label>
        <label className="block text-sm">
          Descripción (opcional)
          <textarea className="input mt-1" maxLength={500} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset>
          <legend className="text-sm">Partidos ({selected.length} elegidos, máx. 30)</legend>
          {fixtures.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No hay partidos reales programados disponibles para crear un reto.</p>
          ) : (
            <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {fixtures.map((f) => (
                <li key={f.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input type="checkbox" className="accent-[#D9B44A]" checked={selected.includes(f.id)} onChange={() => setSelected((s) => toggle(s, f.id).slice(0, 30))} />
                    <span className="flex-1 truncate">{f.homeTeam.name} vs {f.awayTeam.name}</span>
                    <span className="text-xs text-muted">{formatKickoff(f.kickoff, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Sistema de puntos
            <select className="input mt-1" value={system} onChange={(e) => setSystem(e.target.value as typeof system)}>
              {SYSTEMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Formato
            <select className="input mt-1" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
              {FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </div>
        {system !== 'quiniela' && (
          <fieldset>
            <legend className="text-sm">Mercados permitidos</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MARKETS.map(([k, l]) => (
                <label key={k} className={`chip cursor-pointer ${markets.includes(k) ? 'border-gold text-gold-soft' : ''}`}>
                  <input type="checkbox" className="sr-only" checked={markets.includes(k)} onChange={() => setMarkets((m) => (toggle(m, k).length ? toggle(m, k) : m))} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Máximo de participantes
            <input className="input mt-1" type="number" min={2} max={500} value={maxParticipants} onChange={(e) => setMaxParticipants(Number(e.target.value))} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-muted">
            <input type="checkbox" className="accent-[#D9B44A]" checked={withSponsor} onChange={(e) => setWithSponsor(e.target.checked)} />
            Mostrar patrocinador del reto (si está activo)
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <button className="btn-primary" type="submit" disabled={selected.length === 0 || title.length < 3} data-testid="challenge-submit">
          Crear reto
        </button>
        <p className="text-xs text-muted">Sin dinero real: no hay inscripciones, depósitos ni premios monetarios. Las selecciones se bloquean al inicio de cada partido y los resultados se liquidan automáticamente.</p>
      </form>
      <aside className="card p-5">
        <h2 className="font-semibold">Mis retos (este navegador)</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Aún no creaste retos aquí.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {mine.map((c) => (
              <li key={c.code}><Link className="hover:text-gold-soft" href={`/challenge/${c.code}`}>{c.title}</Link> <span className="tabular text-xs text-muted">{c.code}</span></li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
