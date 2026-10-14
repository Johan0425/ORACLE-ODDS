import Link from 'next/link';
import { COMPLIANCE } from '@/lib/compliance';

export function RiskDisclosure({ compact = false, extra }: { compact?: boolean; extra?: string[] }) {
  return (
    <aside aria-label="Aviso de riesgo" className={`rounded-xl border border-warning/25 bg-warning/5 ${compact ? 'p-3 text-xs' : 'p-4 text-sm'} text-muted`}>
      <p className="font-semibold text-warning">Aviso importante</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>{COMPLIANCE.disclaimer}</li>
        <li>{COMPLIANCE.oddsChange}</li>
        <li>{COMPLIANCE.addiction}</li>
        {extra?.map((e) => <li key={e}>{e}</li>)}
      </ul>
      {!compact && (
        <p className="mt-2">
          <Link href="/methodology" className="underline">Metodología</Link> · <Link href="/disclaimer" className="underline">Descargo de responsabilidad</Link>
        </p>
      )}
    </aside>
  );
}
