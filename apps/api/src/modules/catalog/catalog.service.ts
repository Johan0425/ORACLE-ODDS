import { Injectable } from '@nestjs/common';
import type { SportKey } from '@prisma/client';
import { MARKET_DEFINITIONS, SETTLEMENT_RULES_VERSION } from '@oracle-odds/probability-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityResolverService } from '../normalization/entity-resolver.service';

const SPORTS: SportKey[] = ['FOOTBALL', 'BASKETBALL', 'TENNIS', 'BASEBALL', 'NFL', 'HOCKEY', 'MMA'];

/** Datos de referencia (deportes y definiciones de mercado). No son datos de partidos: no se inventa nada. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, private readonly resolver: EntityResolverService) {}

  async upsertCatalog(): Promise<{ sports: number; markets: number }> {
    let markets = 0;
    for (const key of SPORTS) {
      const sportId = await this.resolver.sportId(key);
      for (const def of Object.values(MARKET_DEFINITIONS)) {
        if (!def.sports.includes(key)) continue;
        await this.prisma.marketDefinition.upsert({
          where: { canonicalKey_sportId: { canonicalKey: def.key, sportId } },
          create: {
            canonicalKey: def.key,
            sportId,
            displayName: def.displayName,
            period: def.period,
            outcomeType: def.outcomeType,
            supportsLine: def.supportsLine,
            settlementRulesVersion: SETTLEMENT_RULES_VERSION,
          },
          update: { displayName: def.displayName, settlementRulesVersion: SETTLEMENT_RULES_VERSION },
        });
        markets += 1;
      }
    }
    return { sports: SPORTS.length, markets };
  }
}
