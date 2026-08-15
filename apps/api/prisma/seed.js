// Seed mínimo para desarrollo local: una liga con dos equipos, su historial reciente
// y un H2H, suficiente para que /fixtures/:id/probabilities calcule algo real.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function recentMatch(goalsFor, goalsAgainst, daysAgo) {
  return { goalsFor, goalsAgainst, daysAgo };
}

async function seedTeamHistory(teamId, matches) {
  for (const m of matches) {
    const kickoff = new Date(Date.now() - m.daysAgo * 24 * 60 * 60 * 1000);
    const opponentPlaceholder = await prisma.team.findFirst({ where: { id: { not: teamId } } });

    const fixture = await prisma.fixture.create({
      data: {
        sportId: opponentPlaceholder.sportId,
        leagueId: (await prisma.league.findFirst()).id,
        homeTeamId: teamId,
        awayTeamId: opponentPlaceholder.id,
        kickoff,
        status: 'FINISHED',
        homeScore: m.goalsFor,
        awayScore: m.goalsAgainst,
      },
    });

    await prisma.fixtureStat.create({
      data: { fixtureId: fixture.id, teamId, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, corners: 5 },
    });
  }
}

async function main() {
  const sport = await prisma.sport.upsert({
    where: { key: 'FOOTBALL' },
    create: { key: 'FOOTBALL', name: 'Fútbol' },
    update: {},
  });

  const league = await prisma.league.upsert({
    where: { sportId_name_season: { sportId: sport.id, name: 'LaLiga', season: '2025/2026' } },
    create: { sportId: sport.id, name: 'LaLiga', country: 'España', season: '2025/2026' },
    update: {},
  });

  const home = await prisma.team.create({ data: { sportId: sport.id, name: 'Real Madrid', country: 'España' } });
  const away = await prisma.team.create({ data: { sportId: sport.id, name: 'FC Barcelona', country: 'España' } });

  // Historial reciente: el local llega en mejor forma que el visitante.
  await seedTeamHistory(home.id, [
    recentMatch(3, 0, 40),
    recentMatch(2, 1, 33),
    recentMatch(2, 0, 26),
    recentMatch(1, 1, 19),
    recentMatch(3, 1, 12),
  ]);
  await seedTeamHistory(away.id, [
    recentMatch(1, 2, 38),
    recentMatch(1, 1, 31),
    recentMatch(0, 1, 24),
    recentMatch(2, 2, 17),
    recentMatch(1, 0, 10),
  ]);

  const fixture = await prisma.fixture.create({
    data: {
      sportId: sport.id,
      leagueId: league.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoff: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      status: 'SCHEDULED',
    },
  });

  console.log('Fixture de prueba creado:', fixture.id);
  console.log(`Probar con: curl http://localhost:3001/api/v1/fixtures/${fixture.id}/probabilities`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
