import { cn } from '@/lib/cn';
import type { ApiTeamForm } from '@/lib/api';

const RESULT_STYLES: Record<ApiTeamForm['result'], string> = {
  W: 'bg-neon/20 text-neon',
  D: 'bg-white/15 text-white/70',
  L: 'bg-red-500/15 text-red-300',
};

export function FormBadges({ form }: { form: ApiTeamForm[] }) {
  return (
    <div className="flex gap-1.5">
      {form.map((match) => (
        <span
          key={match.fixtureId}
          title={`${match.goalsFor}-${match.goalsAgainst}`}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold',
            RESULT_STYLES[match.result],
          )}
        >
          {match.result}
        </span>
      ))}
    </div>
  );
}
