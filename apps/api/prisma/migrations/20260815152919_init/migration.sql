-- CreateEnum
CREATE TYPE "SportKey" AS ENUM ('FOOTBALL', 'BASKETBALL', 'TENNIS', 'BASEBALL', 'NFL', 'HOCKEY', 'MMA');

-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('MONEYLINE_1X2', 'MONEYLINE_2WAY', 'ASIAN_HANDICAP', 'EUROPEAN_HANDICAP', 'OVER_UNDER_GOALS', 'OVER_UNDER_POINTS', 'OVER_UNDER_CORNERS', 'OVER_UNDER_CARDS', 'BTTS', 'CORRECT_SCORE');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DataProvider" AS ENUM ('API_FOOTBALL', 'THE_ODDS_API', 'THESPORTSDB', 'SPORTS_GAME_ODDS');

-- CreateTable
CREATE TABLE "sports" (
    "id" TEXT NOT NULL,
    "key" "SportKey" NOT NULL,
    "name" TEXT NOT NULL,
    "isIndividual" BOOLEAN NOT NULL DEFAULT false,
    "iconUrl" TEXT,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leagues" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "season" TEXT NOT NULL,
    "tier" INTEGER,
    "logoUrl" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "country" TEXT,
    "logoUrl" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "injuries" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "DataProvider",

    CONSTRAINT "injuries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixtures" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "venue" TEXT,
    "round" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "externalIds" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_stats" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "goalsFor" INTEGER,
    "goalsAgainst" INTEGER,
    "corners" INTEGER,
    "yellowCards" INTEGER,
    "redCards" INTEGER,
    "shotsOnGoal" INTEGER,
    "possession" DOUBLE PRECISION,
    "points" INTEGER,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "fixture_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odds_snapshots" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "selection" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "price" DOUBLE PRECISION NOT NULL,
    "impliedProbability" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculated_probabilities" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "market" "Market" NOT NULL,
    "selection" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "probability" DOUBLE PRECISION NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "marketImpliedProbability" DOUBLE PRECISION,
    "edge" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculated_probabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_teams" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_leagues" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_view_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_view_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_quota_usage" (
    "id" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "date" DATE NOT NULL,
    "requestsUsed" INTEGER NOT NULL DEFAULT 0,
    "requestLimit" INTEGER NOT NULL,

    CONSTRAINT "provider_quota_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sports_key_key" ON "sports"("key");

-- CreateIndex
CREATE INDEX "leagues_sportId_idx" ON "leagues"("sportId");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_sportId_name_season_key" ON "leagues"("sportId", "name", "season");

-- CreateIndex
CREATE INDEX "teams_sportId_idx" ON "teams"("sportId");

-- CreateIndex
CREATE INDEX "players_teamId_idx" ON "players"("teamId");

-- CreateIndex
CREATE INDEX "injuries_playerId_idx" ON "injuries"("playerId");

-- CreateIndex
CREATE INDEX "fixtures_sportId_kickoff_idx" ON "fixtures"("sportId", "kickoff");

-- CreateIndex
CREATE INDEX "fixtures_leagueId_idx" ON "fixtures"("leagueId");

-- CreateIndex
CREATE INDEX "fixtures_status_idx" ON "fixtures"("status");

-- CreateIndex
CREATE INDEX "fixtures_homeTeamId_idx" ON "fixtures"("homeTeamId");

-- CreateIndex
CREATE INDEX "fixtures_awayTeamId_idx" ON "fixtures"("awayTeamId");

-- CreateIndex
CREATE INDEX "fixture_stats_teamId_idx" ON "fixture_stats"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_stats_fixtureId_teamId_key" ON "fixture_stats"("fixtureId", "teamId");

-- CreateIndex
CREATE INDEX "odds_snapshots_fixtureId_market_idx" ON "odds_snapshots"("fixtureId", "market");

-- CreateIndex
CREATE INDEX "odds_snapshots_capturedAt_idx" ON "odds_snapshots"("capturedAt");

-- CreateIndex
CREATE INDEX "calculated_probabilities_fixtureId_idx" ON "calculated_probabilities"("fixtureId");

-- CreateIndex
CREATE INDEX "calculated_probabilities_market_idx" ON "calculated_probabilities"("market");

-- CreateIndex
CREATE INDEX "calculated_probabilities_edge_idx" ON "calculated_probabilities"("edge");

-- CreateIndex
CREATE UNIQUE INDEX "calculated_probabilities_fixtureId_market_selection_line_mo_key" ON "calculated_probabilities"("fixtureId", "market", "selection", "line", "modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_teams_userId_teamId_key" ON "favorite_teams"("userId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_leagues_userId_leagueId_key" ON "favorite_leagues"("userId", "leagueId");

-- CreateIndex
CREATE INDEX "match_view_history_userId_viewedAt_idx" ON "match_view_history"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_quota_usage_provider_date_key" ON "provider_quota_usage"("provider", "date");

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_stats" ADD CONSTRAINT "fixture_stats_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_stats" ADD CONSTRAINT "fixture_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculated_probabilities" ADD CONSTRAINT "calculated_probabilities_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_teams" ADD CONSTRAINT "favorite_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_teams" ADD CONSTRAINT "favorite_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_leagues" ADD CONSTRAINT "favorite_leagues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_leagues" ADD CONSTRAINT "favorite_leagues_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_view_history" ADD CONSTRAINT "match_view_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_view_history" ADD CONSTRAINT "match_view_history_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
