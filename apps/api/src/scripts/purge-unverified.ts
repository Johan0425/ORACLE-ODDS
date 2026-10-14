import { PrismaClient } from '@prisma/client';

/**
 * Elimina registros de la versión anterior que no tienen procedencia de un
 * proveedor real (fixtures con primaryProvider = NULL, típicamente datos de
 * demo sembrados). La API pública ya los ignora; este script es opcional,
 * explícito y requiere --confirm. Haz un backup antes (docs/operations-runbook.md).
 */
async function main() {
  const confirm = process.argv.includes('--confirm');
  const prisma = new PrismaClient();
  const where = { primaryProvider: null };
  const fixtures = await prisma.fixture.findMany({ where, select: { id: true } });
  const ids = fixtures.map((f) => f.id);
  process.stdout.write(`Partidos sin procedencia verificable: ${ids.length}\n`);
  if (!confirm) {
    process.stdout.write('Modo simulación. Ejecuta con --confirm para eliminarlos.\n');
    await prisma.$disconnect();
    return;
  }
  await prisma.$transaction([
    prisma.matchViewHistory.deleteMany({ where: { fixtureId: { in: ids } } }),
    prisma.legacyCalculatedProbability.deleteMany({ where: { fixtureId: { in: ids } } }),
    prisma.legacyOddsSnapshot.deleteMany({ where: { fixtureId: { in: ids } } }),
    prisma.fixtureStat.deleteMany({ where: { fixtureId: { in: ids } } }),
    prisma.fixture.deleteMany({ where: { id: { in: ids } } }),
  ]);
  // Equipos y ligas que quedaron sin partidos ni mapeo de proveedor.
  const mappedTeams = (await prisma.providerEntityMap.findMany({ where: { entityType: 'TEAM' }, select: { internalId: true } })).map((m) => m.internalId);
  const orphanTeams = await prisma.team.deleteMany({
    where: { id: { notIn: mappedTeams }, homeFixtures: { none: {} }, awayFixtures: { none: {} }, players: { none: {} }, favoritedBy: { none: {} } },
  });
  const mappedLeagues = (await prisma.providerEntityMap.findMany({ where: { entityType: 'LEAGUE' }, select: { internalId: true } })).map((m) => m.internalId);
  const orphanLeagues = await prisma.league.deleteMany({ where: { id: { notIn: mappedLeagues }, fixtures: { none: {} }, favoritedBy: { none: {} }, seasons: { none: {} } } });
  process.stdout.write(`Eliminados: ${ids.length} partidos, ${orphanTeams.count} equipos y ${orphanLeagues.count} ligas sin procedencia.\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).message}\n`);
  process.exit(1);
});
