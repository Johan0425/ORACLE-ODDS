-- ORACLE ODDS: evolución a plataforma de producción.
-- No destruye datos: las tablas de cuotas y probabilidades de la versión anterior
-- se renombran a legacy_* (conservando filas, claves e índices) y se crean las
-- nuevas estructuras canónicas. Los partidos existentes sin proveedor de origen
-- quedan con primaryProvider = NULL y la API pública no los expone.

-- RenameLegacyTables
ALTER TABLE "odds_snapshots" RENAME TO "legacy_odds_snapshots";
ALTER TABLE "legacy_odds_snapshots" RENAME CONSTRAINT "odds_snapshots_pkey" TO "legacy_odds_snapshots_pkey";
ALTER TABLE "legacy_odds_snapshots" RENAME CONSTRAINT "odds_snapshots_fixtureId_fkey" TO "legacy_odds_snapshots_fixtureId_fkey";
ALTER INDEX "odds_snapshots_fixtureId_market_idx" RENAME TO "legacy_odds_snapshots_fixtureId_market_idx";
ALTER INDEX "odds_snapshots_capturedAt_idx" RENAME TO "legacy_odds_snapshots_capturedAt_idx";

ALTER TABLE "calculated_probabilities" RENAME TO "legacy_calculated_probabilities";
ALTER TABLE "legacy_calculated_probabilities" RENAME CONSTRAINT "calculated_probabilities_pkey" TO "legacy_calculated_probabilities_pkey";
ALTER TABLE "legacy_calculated_probabilities" RENAME CONSTRAINT "calculated_probabilities_fixtureId_fkey" TO "legacy_calculated_probabilities_fixtureId_fkey";
ALTER INDEX "calculated_probabilities_fixtureId_idx" RENAME TO "legacy_calculated_probabilities_fixtureId_idx";
ALTER INDEX "calculated_probabilities_market_idx" RENAME TO "legacy_calculated_probabilities_market_idx";
ALTER INDEX "calculated_probabilities_edge_idx" RENAME TO "legacy_calculated_probabilities_edge_idx";
ALTER INDEX "calculated_probabilities_fixtureId_market_selection_line_mo_key" RENAME TO "legacy_calculated_probabilities_unique";

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('SPORT', 'COUNTRY', 'LEAGUE', 'SEASON', 'TEAM', 'PLAYER', 'FIXTURE', 'BOOKMAKER', 'MARKET', 'SELECTION');

-- CreateEnum
CREATE TYPE "PredictionRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SUPERSEDED', 'BACKTEST');

-- CreateEnum
CREATE TYPE "ValueBetStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'WITHDRAWN', 'SETTLED');

-- CreateEnum
CREATE TYPE "SettlementResult" AS ENUM ('WIN', 'LOSS', 'PUSH', 'HALF_WIN', 'HALF_LOSS', 'VOID');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FixtureStatus" ADD VALUE 'SUSPENDED';
ALTER TYPE "FixtureStatus" ADD VALUE 'ABANDONED';

-- AlterEnum
ALTER TYPE "DataProvider" ADD VALUE 'ODDS_API_IO';

-- AlterTable
ALTER TABLE "sports" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "countryId" TEXT,
ADD COLUMN     "isTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "strengthRating" DOUBLE PRECISION,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "normalizedName" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "venueName" TEXT;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "normalizedName" TEXT;

-- AlterTable
ALTER TABLE "injuries" ADD COLUMN     "externalKey" TEXT,
ADD COLUMN     "fixtureId" TEXT,
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "fixtures" ADD COLUMN     "elapsedMinutes" INTEGER,
ADD COLUMN     "htAwayScore" INTEGER,
ADD COLUMN     "htHomeScore" INTEGER,
ADD COLUMN     "kickoffChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastScoreUpdateAt" TIMESTAMP(3),
ADD COLUMN     "lineupsConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalKickoff" TIMESTAMP(3),
ADD COLUMN     "period" TEXT,
ADD COLUMN     "primaryProvider" "DataProvider",
ADD COLUMN     "seasonId" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "statusDetail" TEXT;

-- AlterTable
ALTER TABLE "fixture_stats" ADD COLUMN     "expectedGoals" DOUBLE PRECISION,
ADD COLUMN     "shotsTotal" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "provider_quota_usage" ADD COLUMN     "reportedRemaining" INTEGER;

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flagUrl" TEXT,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_events" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" TEXT,
    "minute" INTEGER NOT NULL,
    "extraMinute" INTEGER,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "playerName" TEXT,
    "assistName" TEXT,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixture_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_lineups" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "formation" TEXT,
    "coach" TEXT,
    "startXI" JSONB NOT NULL DEFAULT '[]',
    "substitutes" JSONB NOT NULL DEFAULT '[]',
    "confirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fixture_lineups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standings" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "rank" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "played" INTEGER NOT NULL,
    "won" INTEGER NOT NULL,
    "drawn" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "goalsFor" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "form" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_entity_maps" (
    "id" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_entity_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmakers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "affiliateUrl" TEXT,
    "licenseLabel" TEXT,
    "isAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_definitions" (
    "id" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "outcomeType" TEXT NOT NULL,
    "supportsLine" BOOLEAN NOT NULL,
    "settlementRulesVersion" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odds_snapshots" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "marketKey" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "lineKey" TEXT NOT NULL DEFAULT '',
    "priceDecimal" DOUBLE PRECISION NOT NULL,
    "impliedProbabilityRaw" DOUBLE PRECISION NOT NULL,
    "impliedProbabilityNoVig" DOUBLE PRECISION,
    "overround" DOUBLE PRECISION,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "directBetUrl" TEXT,
    "rawPayloadHash" TEXT NOT NULL,

    CONSTRAINT "odds_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odds_quotes" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "marketKey" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "lineKey" TEXT NOT NULL DEFAULT '',
    "openingPrice" DOUBLE PRECISION NOT NULL,
    "openingAt" TIMESTAMP(3) NOT NULL,
    "previousPrice" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "currentSnapshotId" TEXT NOT NULL,
    "impliedProbabilityNoVig" DOUBLE PRECISION,
    "overround" DOUBLE PRECISION,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "lastChangedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "directBetUrl" TEXT,

    CONSTRAINT "odds_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_runs" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "dataCutoff" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureSnapshot" JSONB NOT NULL,
    "trainingWindow" JSONB NOT NULL,
    "dataQuality" DOUBLE PRECISION,
    "lambdaHome" DOUBLE PRECISION,
    "lambdaAway" DOUBLE PRECISION,
    "status" "PredictionRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "inputHash" TEXT NOT NULL,

    CONSTRAINT "prediction_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculated_probabilities" (
    "id" TEXT NOT NULL,
    "predictionRunId" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "lineKey" TEXT NOT NULL DEFAULT '',
    "rawProbability" DOUBLE PRECISION NOT NULL,
    "calibratedProbability" DOUBLE PRECISION NOT NULL,
    "isCalibrated" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL,
    "confidenceLevel" "ConfidenceLevel" NOT NULL,
    "uncertaintyLower" DOUBLE PRECISION NOT NULL,
    "uncertaintyUpper" DOUBLE PRECISION NOT NULL,
    "fairOdds" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "outcome" "SettlementResult",

    CONSTRAINT "calculated_probabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "value_bets" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "predictionRunId" TEXT NOT NULL,
    "oddsSnapshotId" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "selectionKey" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "lineKey" TEXT NOT NULL DEFAULT '',
    "bookmakerSlug" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "marketProbability" DOUBLE PRECISION NOT NULL,
    "fairOdds" DOUBLE PRECISION NOT NULL,
    "edge" DOUBLE PRECISION NOT NULL,
    "expectedValue" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "freshnessScore" DOUBLE PRECISION NOT NULL,
    "penalties" JSONB NOT NULL DEFAULT '[]',
    "recommendedStakeUnits" DOUBLE PRECISION NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "status" "ValueBetStatus" NOT NULL DEFAULT 'ACTIVE',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawReason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "result" "SettlementResult",
    "profitLossUnits" DOUBLE PRECISION,
    "closingPrice" DOUBLE PRECISION,
    "closingLineValue" DOUBLE PRECISION,

    CONSTRAINT "value_bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_models" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "sportKey" "SportKey" NOT NULL,
    "marketKey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "ece" DOUBLE PRECISION,
    "trainedFrom" TIMESTAMP(3),
    "trainedTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_metric_snapshots" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "sportKey" "SportKey" NOT NULL,
    "leagueId" TEXT NOT NULL DEFAULT '',
    "marketKey" TEXT NOT NULL DEFAULT '',
    "oddsBucket" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "brier" DOUBLE PRECISION,
    "logLoss" DOUBLE PRECISION,
    "ece" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "bets" INTEGER NOT NULL DEFAULT 0,
    "roi" DOUBLE PRECISION,
    "yieldPerBet" DOUBLE PRECISION,
    "hitRate" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "avgClv" DOUBLE PRECISION,
    "roiCiLower" DOUBLE PRECISION,
    "roiCiUpper" DOUBLE PRECISION,
    "calibrationCurve" JSONB NOT NULL DEFAULT '[]',
    "isPublishable" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combinations" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "legs" JSONB NOT NULL,
    "combinedOdds" DOUBLE PRECISION NOT NULL,
    "naiveProbability" DOUBLE PRECISION,
    "adjustedProbability" DOUBLE PRECISION,
    "correlationPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedValue" DOUBLE PRECISION,
    "riskLevel" TEXT NOT NULL,
    "systemType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_assets" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storageUrl" TEXT,
    "publicCode" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "showSponsor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_challenges" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "creatorSecretHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scoringRules" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'OPEN',
    "maxParticipants" INTEGER NOT NULL DEFAULT 100,
    "maxPicksPerEntry" INTEGER NOT NULL DEFAULT 20,
    "sponsorConfig" JSONB,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anonymous_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_fixtures" (
    "challengeId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,

    CONSTRAINT "challenge_fixtures_pkey" PRIMARY KEY ("challengeId","fixtureId")
);

-- CreateTable
CREATE TABLE "challenge_entries" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "anonymousAlias" TEXT NOT NULL,
    "anonymousTokenHash" TEXT NOT NULL,
    "selections" JSONB NOT NULL DEFAULT '[]',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tiebreaker" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_audit_logs" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "fixtureId" TEXT,
    "valueBetId" TEXT,
    "placement" TEXT NOT NULL,
    "subId" TEXT,
    "campaign" TEXT,
    "anonymousSessionHash" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_impressions_daily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "placement" TEXT NOT NULL,
    "bookmakerSlug" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "affiliate_impressions_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_conversions" (
    "id" TEXT NOT NULL,
    "clickId" TEXT NOT NULL,
    "bookmakerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payoutCents" INTEGER,
    "currency" TEXT,
    "externalRef" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_sync_states" (
    "id" TEXT NOT NULL,
    "provider" "DataProvider" NOT NULL,
    "jobName" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessfulSync" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastDurationMs" INTEGER,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run_logs" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "provider" "DataProvider",
    "correlationId" TEXT NOT NULL,
    "status" "SyncRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "sync_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorHash" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "confirmToken" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "consentText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_leagueId_label_key" ON "seasons"("leagueId", "label");

-- CreateIndex
CREATE INDEX "fixture_events_fixtureId_minute_idx" ON "fixture_events"("fixtureId", "minute");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_events_fixtureId_eventKey_key" ON "fixture_events"("fixtureId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "fixture_lineups_fixtureId_teamId_key" ON "fixture_lineups"("fixtureId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "standings_leagueId_season_groupName_teamId_key" ON "standings"("leagueId", "season", "groupName", "teamId");

-- CreateIndex
CREATE INDEX "provider_entity_maps_entityType_internalId_idx" ON "provider_entity_maps"("entityType", "internalId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_entity_maps_provider_entityType_externalId_key" ON "provider_entity_maps"("provider", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "bookmakers_slug_key" ON "bookmakers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "market_definitions_canonicalKey_sportId_key" ON "market_definitions"("canonicalKey", "sportId");

-- CreateIndex
CREATE INDEX "odds_snapshots_fixtureId_marketKey_lineKey_idx" ON "odds_snapshots"("fixtureId", "marketKey", "lineKey");

-- CreateIndex
CREATE INDEX "odds_snapshots_capturedAt_idx" ON "odds_snapshots"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "odds_snapshots_fixtureId_bookmakerId_marketKey_selectionKey_key" ON "odds_snapshots"("fixtureId", "bookmakerId", "marketKey", "selectionKey", "lineKey", "isLive", "rawPayloadHash");

-- CreateIndex
CREATE INDEX "odds_quotes_fixtureId_marketKey_idx" ON "odds_quotes"("fixtureId", "marketKey");

-- CreateIndex
CREATE UNIQUE INDEX "odds_quotes_fixtureId_bookmakerId_marketKey_selectionKey_li_key" ON "odds_quotes"("fixtureId", "bookmakerId", "marketKey", "selectionKey", "lineKey", "isLive");

-- CreateIndex
CREATE INDEX "prediction_runs_fixtureId_generatedAt_idx" ON "prediction_runs"("fixtureId", "generatedAt");

-- CreateIndex
CREATE INDEX "prediction_runs_status_modelVersion_idx" ON "prediction_runs"("status", "modelVersion");

-- CreateIndex
CREATE UNIQUE INDEX "prediction_runs_fixtureId_modelVersion_inputHash_key" ON "prediction_runs"("fixtureId", "modelVersion", "inputHash");

-- CreateIndex
CREATE INDEX "calculated_probabilities_marketKey_idx" ON "calculated_probabilities"("marketKey");

-- CreateIndex
CREATE UNIQUE INDEX "calculated_probabilities_predictionRunId_marketKey_selectio_key" ON "calculated_probabilities"("predictionRunId", "marketKey", "selectionKey", "lineKey");

-- CreateIndex
CREATE INDEX "value_bets_status_qualityScore_idx" ON "value_bets"("status", "qualityScore");

-- CreateIndex
CREATE INDEX "value_bets_fixtureId_idx" ON "value_bets"("fixtureId");

-- CreateIndex
CREATE INDEX "value_bets_detectedAt_idx" ON "value_bets"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "value_bets_fixtureId_marketKey_selectionKey_lineKey_isLive_key" ON "value_bets"("fixtureId", "marketKey", "selectionKey", "lineKey", "isLive");

-- CreateIndex
CREATE INDEX "calibration_models_modelVersion_sportKey_marketKey_isActive_idx" ON "calibration_models"("modelVersion", "sportKey", "marketKey", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "model_metric_snapshots_modelVersion_sportKey_leagueId_marke_key" ON "model_metric_snapshots"("modelVersion", "sportKey", "leagueId", "marketKey", "oddsBucket", "source");

-- CreateIndex
CREATE UNIQUE INDEX "combinations_publicCode_key" ON "combinations"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "share_assets_publicCode_key" ON "share_assets"("publicCode");

-- CreateIndex
CREATE INDEX "share_assets_entityType_entityId_idx" ON "share_assets"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_challenges_publicCode_key" ON "anonymous_challenges"("publicCode");

-- CreateIndex
CREATE INDEX "anonymous_challenges_status_endsAt_idx" ON "anonymous_challenges"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_entries_anonymousTokenHash_key" ON "challenge_entries"("anonymousTokenHash");

-- CreateIndex
CREATE INDEX "challenge_entries_challengeId_score_idx" ON "challenge_entries"("challengeId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_entries_challengeId_anonymousAlias_key" ON "challenge_entries"("challengeId", "anonymousAlias");

-- CreateIndex
CREATE INDEX "challenge_audit_logs_challengeId_createdAt_idx" ON "challenge_audit_logs"("challengeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_clicks_clickId_key" ON "affiliate_clicks"("clickId");

-- CreateIndex
CREATE INDEX "affiliate_clicks_bookmakerId_clickedAt_idx" ON "affiliate_clicks"("bookmakerId", "clickedAt");

-- CreateIndex
CREATE INDEX "affiliate_clicks_placement_clickedAt_idx" ON "affiliate_clicks"("placement", "clickedAt");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_impressions_daily_date_placement_bookmakerSlug_key" ON "affiliate_impressions_daily"("date", "placement", "bookmakerSlug");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_conversions_externalRef_key" ON "affiliate_conversions"("externalRef");

-- CreateIndex
CREATE INDEX "affiliate_conversions_clickId_idx" ON "affiliate_conversions"("clickId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_sync_states_provider_jobName_key" ON "provider_sync_states"("provider", "jobName");

-- CreateIndex
CREATE INDEX "sync_run_logs_jobName_startedAt_idx" ON "sync_run_logs"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_email_key" ON "newsletter_subscriptions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscriptions_confirmToken_key" ON "newsletter_subscriptions"("confirmToken");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_slug_key" ON "leagues"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE INDEX "teams_normalizedName_idx" ON "teams"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "injuries_externalKey_key" ON "injuries"("externalKey");

-- CreateIndex
CREATE INDEX "injuries_fixtureId_idx" ON "injuries"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "fixtures_slug_key" ON "fixtures"("slug");

-- CreateIndex
CREATE INDEX "fixtures_primaryProvider_kickoff_idx" ON "fixtures"("primaryProvider", "kickoff");

-- AddForeignKey
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_events" ADD CONSTRAINT "fixture_events_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_lineups" ADD CONSTRAINT "fixture_lineups_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_lineups" ADD CONSTRAINT "fixture_lineups_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standings" ADD CONSTRAINT "standings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_definitions" ADD CONSTRAINT "market_definitions_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_snapshots" ADD CONSTRAINT "odds_snapshots_bookmakerId_fkey" FOREIGN KEY ("bookmakerId") REFERENCES "bookmakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_quotes" ADD CONSTRAINT "odds_quotes_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds_quotes" ADD CONSTRAINT "odds_quotes_bookmakerId_fkey" FOREIGN KEY ("bookmakerId") REFERENCES "bookmakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prediction_runs" ADD CONSTRAINT "prediction_runs_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculated_probabilities" ADD CONSTRAINT "calculated_probabilities_predictionRunId_fkey" FOREIGN KEY ("predictionRunId") REFERENCES "prediction_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_bets" ADD CONSTRAINT "value_bets_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_bets" ADD CONSTRAINT "value_bets_predictionRunId_fkey" FOREIGN KEY ("predictionRunId") REFERENCES "prediction_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_bets" ADD CONSTRAINT "value_bets_oddsSnapshotId_fkey" FOREIGN KEY ("oddsSnapshotId") REFERENCES "odds_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_fixtures" ADD CONSTRAINT "challenge_fixtures_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "anonymous_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_fixtures" ADD CONSTRAINT "challenge_fixtures_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "anonymous_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_audit_logs" ADD CONSTRAINT "challenge_audit_logs_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "anonymous_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_bookmakerId_fkey" FOREIGN KEY ("bookmakerId") REFERENCES "bookmakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

