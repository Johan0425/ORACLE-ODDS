import type { MetadataRoute } from 'next';
import { apiGet, type FixtureList, type League } from '@/lib/api';
import { SITE_URL } from '@/lib/site';
import { MARKET_DEFINITIONS } from '@oracle-odds/probability-engine';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics = ['', '/matches', '/live', '/best-bets', '/odds-comparison', '/builder', '/challenges', '/track-record', '/methodology', '/responsible-gambling', '/status', '/sponsor/betsantander', '/terms', '/privacy', '/cookies', '/disclaimer'];
  const [fixtures, leagues] = await Promise.all([apiGet<FixtureList>('/fixtures?date=week&limit=100'), apiGet<League[]>('/leagues')]);
  return [
    ...statics.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'daily' as const, priority: p === '' ? 1 : 0.6 })),
    ...Object.values(MARKET_DEFINITIONS).filter((m) => m.sports.includes('FOOTBALL')).map((m) => ({ url: `${SITE_URL}/markets/${m.key}`, changeFrequency: 'daily' as const, priority: 0.4 })),
    ...(leagues.ok ? leagues.data.filter((l) => l.slug).map((l) => ({ url: `${SITE_URL}/leagues/${l.slug}`, changeFrequency: 'daily' as const, priority: 0.5 })) : []),
    ...(fixtures.ok ? fixtures.data.items.map((f) => ({ url: `${SITE_URL}/matches/${f.id}`, lastModified: f.updatedAt, changeFrequency: 'hourly' as const, priority: 0.7 })) : []),
  ];
}
