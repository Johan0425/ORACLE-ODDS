import type { ReactNode } from 'react';

export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-4 text-[15px] leading-7 text-muted [&_a]:text-gold [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">{children}</div>;
}
