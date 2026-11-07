import { OG_SIZE } from '@/lib/og';
import { picksOgImage } from '@/lib/og-picks';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'ORACLE ODDS: pronósticos de fútbol con estadística';
export const revalidate = 600;

export default function Image() {
  return picksOgImage(0, null, 'Pronósticos de fútbol');
}
