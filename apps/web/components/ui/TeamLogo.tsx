/* eslint-disable @next/next/no-img-element */
export function TeamLogo({ name, src, size = 28 }: { name: string; src: string | null | undefined; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  if (!src) {
    return (
      <span aria-hidden style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-bold text-muted">
        {initials || '·'}
      </span>
    );
  }
  return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 object-contain" style={{ width: size, height: size }} />;
}
