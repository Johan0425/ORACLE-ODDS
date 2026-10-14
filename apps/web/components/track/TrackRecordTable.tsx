import Link from 'next/link';
import type { TrackRecord } from '@/lib/api';
import { formatKickoff, marketName, odds, pct, RESULT_LABEL, selectionName, signedPct, units } from '@/lib/format';

const RESULT_STYLE: Record<string, string> = { WIN: 'text-positive', HALF_WIN: 'text-positive', LOSS: 'text-negative', HALF_LOSS: 'text-negative', PUSH: 'text-muted', VOID: 'text-muted' };

export function TrackRecordTable({ items }: { items: TrackRecord['items'] }) {
  return (
    <div className="card overflow-x-auto p-2">
      <table className="tabular w-full min-w-[960px] text-sm">
        <caption className="sr-only">Historial de oportunidades publicadas</caption>
        <thead className="text-left text-xs text-muted">
          <tr>{['Publicada', 'Partido', 'Selección', 'Cuota', 'Prob.', 'Edge', 'EV', 'Cierre', 'CLV', 'Marcador', 'Resultado', 'P/L'].map((h) => <th key={h} scope="col" className="px-2 py-2">{h}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.id} className="border-t border-line">
              <td className="px-2 py-2 text-muted">{formatKickoff(b.detectedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td className="px-2"><Link href={`/matches/${b.fixture.id}`} className="hover:text-gold-soft">{b.fixture.homeTeam} vs {b.fixture.awayTeam}</Link><span className="block text-xs text-muted">{b.fixture.league}</span></td>
              <td className="px-2">{marketName(b.marketKey)}: {selectionName(b.marketKey, b.selectionKey, b.line, b.fixture.homeTeam, b.fixture.awayTeam)}{b.withdrawnAt && <span className="block text-xs text-warning">Retirada antes del inicio (se liquida igual)</span>}</td>
              <td className="px-2">{odds(b.price)}</td>
              <td className="px-2">{pct(b.probability)}</td>
              <td className="px-2">{signedPct(b.edge)}</td>
              <td className="px-2">{signedPct(b.expectedValue)}</td>
              <td className="px-2">{odds(b.closingPrice)}</td>
              <td className="px-2">{signedPct(b.closingLineValue)}</td>
              <td className="px-2">{b.fixture.homeScore != null ? `${b.fixture.homeScore}–${b.fixture.awayScore}` : '—'}</td>
              <td className={`px-2 font-semibold ${RESULT_STYLE[b.result ?? ''] ?? 'text-muted'}`}>{b.result ? RESULT_LABEL[b.result] : 'Pendiente'}</td>
              <td className="px-2">{units(b.profitLossUnits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
