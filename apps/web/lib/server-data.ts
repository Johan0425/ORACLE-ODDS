import 'server-only';
import { apiGet, type DataStatus, type SponsorConfig } from './api';

export async function sponsorConfig(placement: string): Promise<SponsorConfig | null> {
  const r = await apiGet<SponsorConfig>(`/sponsor/config?placement=${placement}`, { revalidate: 300 });
  return r.ok ? r.data : null;
}

export async function dataStatus(): Promise<DataStatus | null> {
  const r = await apiGet<DataStatus>('/data-status', { revalidate: 30 });
  return r.ok ? r.data : null;
}
