import { z } from 'zod';
import type { AppEnv } from '../../config/env';
import { ProviderHttpClient } from '../../common/http/provider-http-client';
import type { MetadataProvider } from '../interfaces';

const teamsSchema = z.object({
  teams: z
    .array(
      z
        .object({
          strTeam: z.string(),
          strBadge: z.string().nullable().optional(),
          strTeamBadge: z.string().nullable().optional(),
          strStadium: z.string().nullable().optional(),
          strSport: z.string().nullable().optional(),
        })
        .passthrough(),
    )
    .nullable(),
});

/**
 * TheSportsDB: solo metadatos (escudos, estadio). Jamás se usa para cuotas,
 * marcadores ni estadísticas; si no encuentra el equipo devuelve null.
 */
export class TheSportsDbAdapter implements MetadataProvider {
  readonly provider = 'THESPORTSDB' as const;
  private readonly http: ProviderHttpClient | null;

  constructor(env: AppEnv, fetchImpl?: typeof fetch) {
    this.http = env.THESPORTSDB_KEY
      ? new ProviderHttpClient({
          provider: this.provider,
          baseUrl: `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(env.THESPORTSDB_KEY)}/`,
          perMinute: 25,
          maxRetries: 1,
          fetchImpl,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.http != null;
  }

  async findTeamBadge(teamName: string): Promise<{ logoUrl: string | null; venueName: string | null } | null> {
    if (!this.http) return null;
    const res = await this.http.get<unknown>('searchteams.php', { t: teamName });
    const parsed = teamsSchema.safeParse(res.data);
    if (!parsed.success || !parsed.data.teams) return null;
    const exact = parsed.data.teams.find((t) => t.strTeam.toLowerCase() === teamName.toLowerCase() && (t.strSport ?? 'Soccer') === 'Soccer');
    if (!exact) return null;
    return { logoUrl: exact.strBadge ?? exact.strTeamBadge ?? null, venueName: exact.strStadium ?? null };
  }
}
