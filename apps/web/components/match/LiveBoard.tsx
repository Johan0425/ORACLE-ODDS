'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiGet, PUBLIC_API_URL, type LiveFixture } from '@/lib/api';
import { LiveMatchCard } from './LiveMatchCard';
import { DataUnavailable, EmptyState } from '../ui/EmptyState';

/** Tablero en vivo: SSE para empujar cambios y refresco del listado (con respaldo por polling). */
export function LiveBoard({ initial, initialError }: { initial: LiveFixture[]; initialError: string | null }) {
  const [fixtures, setFixtures] = useState(initial);
  const [error, setError] = useState(initialError);
  const [connected, setConnected] = useState(false);
  const [sport, setSport] = useState('');
  const [league, setLeague] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      // Agrupa ráfagas de eventos en un solo refresco.
      timer = setTimeout(async () => {
        timer = null;
        const r = await apiGet<LiveFixture[]>('/fixtures/live');
        if (r.ok) {
          setFixtures(r.data);
          setError(null);
        } else setError(r.error);
      }, 800);
    };
    let source: EventSource | null = null;
    try {
      source = new EventSource(`${PUBLIC_API_URL}/fixtures/live/stream`);
      source.onopen = () => setConnected(true);
      source.onerror = () => setConnected(false);
      source.addEventListener('fixture', refresh);
      source.addEventListener('odds', refresh);
    } catch {
      setConnected(false);
    }
    const poll = setInterval(refresh, 30_000);
    return () => {
      source?.close();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const sports = useMemo(() => [...new Map(fixtures.map((f) => [f.sport.key, f.sport.name])).entries()], [fixtures]);
  const leagues = useMemo(() => [...new Map(fixtures.map((f) => [f.league.id, f.league.name])).entries()], [fixtures]);
  const shown = fixtures.filter((f) => (!sport || f.sport.key === sport) && (!league || f.league.id === league));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          Deporte
          <select className="input mt-1" value={sport} onChange={(e) => setSport(e.target.value)}>
            <option value="">Todos</option>
            {sports.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Competición
          <select className="input mt-1" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="">Todas</option>
            {leagues.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <span role="status" className={`text-xs ${connected ? 'text-positive' : 'text-muted'}`}>
          {connected ? '● Conectado al stream de actualizaciones' : '○ Stream no disponible: refresco cada 30 s'}
        </span>
      </div>
      {error && fixtures.length === 0 ? (
        <DataUnavailable error={error} />
      ) : shown.length === 0 ? (
        <EmptyState title="No hay partidos en vivo en este momento">
          <p>Cuando un partido sincronizado comience, aparecerá aquí con su marcador y la antigüedad del dato.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((f) => <LiveMatchCard key={f.id} f={f} />)}
        </div>
      )}
    </div>
  );
}
