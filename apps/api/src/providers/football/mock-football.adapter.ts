import { Injectable } from '@nestjs/common';
import type { FootballProvider, ProviderFixture, ProviderH2H, ProviderTeamStats } from './football-provider.interface';

/**
 * Implementación de desarrollo: no llama a ninguna API externa. Permite levantar y
 * probar el módulo `sync` sin gastar cupo real ni requerir credenciales todavía.
 * En producción se reemplaza por `ApiFootballAdapter` sin tocar ningún consumidor.
 */
@Injectable()
export class MockFootballAdapter implements FootballProvider {
  async getFixtures(_leagueExternalId: string, _from: Date, _to: Date): Promise<ProviderFixture[]> {
    return [];
  }

  async getTeamRecentMatches(teamExternalId: string, _lastN: number): Promise<ProviderTeamStats> {
    return { teamExternalId, recentMatches: [] };
  }

  async getH2H(): Promise<ProviderH2H> {
    return { matches: [] };
  }
}
