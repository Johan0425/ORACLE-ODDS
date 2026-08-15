// Seed de demo: varias ligas reales, equipos con "fuerza" simulada (ataque/defensa),
// ~12 partidos históricos por equipo (para forma ponderada) y un barrido de partidos
// programados para HOY repartido entre las ligas, con H2H real para esos cruces.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

const LEAGUES = [
  {
    name: 'LaLiga',
    country: 'España',
    teams: [
      { name: 'Real Madrid', attack: 1.55, defense: 0.7 },
      { name: 'FC Barcelona', attack: 1.45, defense: 0.75 },
      { name: 'Atlético de Madrid', attack: 1.05, defense: 0.7 },
      { name: 'Sevilla FC', attack: 0.85, defense: 1.1 },
    ],
  },
  {
    name: 'Premier League',
    country: 'Inglaterra',
    teams: [
      { name: 'Manchester City', attack: 1.6, defense: 0.65 },
      { name: 'Liverpool FC', attack: 1.5, defense: 0.75 },
      { name: 'Arsenal FC', attack: 1.3, defense: 0.8 },
      { name: 'Chelsea FC', attack: 0.95, defense: 1.0 },
    ],
  },
  {
    name: 'Serie A',
    country: 'Italia',
    teams: [
      { name: 'Inter de Milán', attack: 1.4, defense: 0.7 },
      { name: 'Juventus FC', attack: 1.1, defense: 0.7 },
      { name: 'AC Milan', attack: 1.15, defense: 0.9 },
      { name: 'SSC Napoli', attack: 1.05, defense: 0.9 },
    ],
  },
  {
    name: 'Bundesliga',
    country: 'Alemania',
    teams: [
      { name: 'Bayern Múnich', attack: 1.7, defense: 0.65 },
      { name: 'Borussia Dortmund', attack: 1.25, defense: 1.0 },
      { name: 'RB Leipzig', attack: 1.15, defense: 0.9 },
      { name: 'Bayer Leverkusen', attack: 1.3, defense: 0.8 },
    ],
  },
];

/** Muestreo de Poisson por inversión (algoritmo de Knuth) — mismo tipo de distribución que usa el motor real. */
function poissonSample(lambda) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > l);
  return k - 1;
}

function simulateScore(home, away) {
  const homeGoals = poissonSample(Math.max(0.2, home.attack * away.defense * 1.15));
  const awayGoals = poissonSample(Math.max(0.2, away.attack * home.defense));
  return { homeGoals, awayGoals };
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function daysAgo(n) {
  return new Date(Date.now() - n * DAY_MS);
}

// En UTC explícito: el filtro `/fixtures?date=` de la API usa límites de día en
// UTC, así que generar horarios en tiempo local del sandbox (o de donde sea que
// corra el seed) podía empujar partidos de la noche al día siguiente en UTC.
function todayAtUtc(hour, minute = 0) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0));
}

async function wipeDemoData() {
  // Orden por dependencias de FK; no se toca la tabla de usuarios.
  await prisma.matchViewHistory.deleteMany();
  await prisma.favoriteTeam.deleteMany();
  await prisma.favoriteLeague.deleteMany();
  await prisma.calculatedProbability.deleteMany();
  await prisma.oddsSnapshot.deleteMany();
  await prisma.fixtureStat.deleteMany();
  await prisma.injury.deleteMany();
  await prisma.player.deleteMany();
  await prisma.fixture.deleteMany();
  await prisma.team.deleteMany();
  await prisma.league.deleteMany();
}

async function seedTeamHistory(sportId, leagueId, team, teamId, opponents) {
  for (let i = 0; i < 12; i++) {
    const opponent = opponents[randomInt(0, opponents.length - 1)];
    const isHome = i % 2 === 0;
    const home = isHome ? team : opponent.data;
    const away = isHome ? opponent.data : team;
    const { homeGoals, awayGoals } = simulateScore(home, away);

    const fixture = await prisma.fixture.create({
      data: {
        sportId,
        leagueId,
        homeTeamId: isHome ? teamId : opponent.id,
        awayTeamId: isHome ? opponent.id : teamId,
        kickoff: daysAgo(10 + i * 7 + randomInt(0, 3)),
        status: 'FINISHED',
        homeScore: homeGoals,
        awayScore: awayGoals,
      },
    });

    const goalsFor = isHome ? homeGoals : awayGoals;
    const goalsAgainst = isHome ? awayGoals : homeGoals;
    await prisma.fixtureStat.create({
      data: {
        fixtureId: fixture.id,
        teamId,
        goalsFor,
        goalsAgainst,
        corners: randomInt(3, 9),
        yellowCards: randomInt(0, 4),
        redCards: Math.random() < 0.08 ? 1 : 0,
      },
    });
  }
}

async function seedH2H(sportId, leagueId, homeId, awayId, homeTeam, awayTeam) {
  const count = randomInt(2, 4);
  for (let i = 0; i < count; i++) {
    const { homeGoals, awayGoals } = simulateScore(homeTeam, awayTeam);
    await prisma.fixture.create({
      data: {
        sportId,
        leagueId,
        homeTeamId: homeId,
        awayTeamId: awayId,
        kickoff: daysAgo(120 + i * 90 + randomInt(0, 20)),
        status: 'FINISHED',
        homeScore: homeGoals,
        awayScore: awayGoals,
      },
    });
  }
}

async function main() {
  console.log('Limpiando datos demo previos...');
  await wipeDemoData();

  const sport = await prisma.sport.upsert({
    where: { key: 'FOOTBALL' },
    create: { key: 'FOOTBALL', name: 'Fútbol' },
    update: {},
  });

  const todaysFixtureIds = [];
  const kickoffSlots = [12, 14.5, 17, 19.5];
  let slotIndex = 0;

  for (const leagueConfig of LEAGUES) {
    console.log(`Sembrando ${leagueConfig.name}...`);

    const league = await prisma.league.create({
      data: { sportId: sport.id, name: leagueConfig.name, country: leagueConfig.country, season: '2025/2026' },
    });

    const teams = [];
    for (const teamConfig of leagueConfig.teams) {
      const team = await prisma.team.create({
        data: { sportId: sport.id, name: teamConfig.name, country: leagueConfig.country },
      });
      teams.push({ id: team.id, data: teamConfig });
    }

    // Historial reciente de cada equipo, contra rivales de la misma liga.
    for (const team of teams) {
      const opponents = teams.filter((t) => t.id !== team.id);
      await seedTeamHistory(sport.id, league.id, team.data, team.id, opponents);
    }

    // Partidos de HOY: se emparejan los equipos por pares (0 vs 1, 2 vs 3, ...).
    for (let i = 0; i + 1 < teams.length; i += 2) {
      const home = teams[i];
      const away = teams[i + 1];
      const hour = kickoffSlots[slotIndex % kickoffSlots.length];
      slotIndex += 1;

      await seedH2H(sport.id, league.id, home.id, away.id, home.data, away.data);

      const fixture = await prisma.fixture.create({
        data: {
          sportId: sport.id,
          leagueId: league.id,
          homeTeamId: home.id,
          awayTeamId: away.id,
          kickoff: todayAtUtc(Math.floor(hour), (hour % 1) * 60),
          status: 'SCHEDULED',
        },
      });
      todaysFixtureIds.push({ id: fixture.id, home: home.data.name, away: away.data.name, league: leagueConfig.name });
    }
  }

  console.log(`\nListo — ${todaysFixtureIds.length} partidos de hoy sembrados:\n`);
  for (const f of todaysFixtureIds) {
    console.log(`  [${f.league}] ${f.home} vs ${f.away} — ${f.id}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
