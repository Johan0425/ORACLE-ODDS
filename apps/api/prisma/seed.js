// Seed SOLO para desarrollo: inserta datos de referencia (deportes y
// definiciones canónicas de mercado). No crea partidos, cuotas, resultados ni
// estadísticas: esos datos solo llegan desde proveedores reales.
const { PrismaClient } = require('@prisma/client');
const { MARKET_DEFINITIONS, SETTLEMENT_RULES_VERSION } = require('@oracle-odds/probability-engine');

if (process.env.NODE_ENV === 'production') {
  console.error('El seed es solo para desarrollo. En producción el catálogo lo crea el job sync:sports-catalog.');
  process.exit(1);
}

const prisma = new PrismaClient();
const SPORTS = {
  FOOTBALL: 'Fútbol',
  BASKETBALL: 'Baloncesto',
  TENNIS: 'Tenis',
  BASEBALL: 'Béisbol',
  NFL: 'Fútbol americano',
  HOCKEY: 'Hockey',
  MMA: 'MMA',
};

async function main() {
  let markets = 0;
  for (const [key, name] of Object.entries(SPORTS)) {
    const sport = await prisma.sport.upsert({
      where: { key },
      create: { key, name, isIndividual: key === 'TENNIS' || key === 'MMA' },
      update: { name },
    });
    for (const def of Object.values(MARKET_DEFINITIONS)) {
      if (!def.sports.includes(key)) continue;
      await prisma.marketDefinition.upsert({
        where: { canonicalKey_sportId: { canonicalKey: def.key, sportId: sport.id } },
        create: {
          canonicalKey: def.key,
          sportId: sport.id,
          displayName: def.displayName,
          period: def.period,
          outcomeType: def.outcomeType,
          supportsLine: def.supportsLine,
          settlementRulesVersion: SETTLEMENT_RULES_VERSION,
        },
        update: { displayName: def.displayName },
      });
      markets += 1;
    }
  }
  console.log(`Catálogo listo: ${Object.keys(SPORTS).length} deportes, ${markets} definiciones de mercado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
