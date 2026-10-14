import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProvidersModule } from '../../providers/providers.module';
import { EntityResolverService } from '../normalization/entity-resolver.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { CatalogService } from '../catalog/catalog.service';
import { PredictionsService } from '../predictions/predictions.service';
import { PublicationPolicyService } from '../model-metrics/publication-policy.service';
import { ModelMetricsService } from '../model-metrics/model-metrics.service';
import { ValueBetsService } from '../value-bets/value-bets.service';
import { SettlementService } from '../settlement/settlement.service';
import { LiveEventsService } from '../live/live-events.service';
import { SponsorService } from '../affiliate/sponsor.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { ChallengesService } from '../challenges/challenges.service';
import { ShareService } from '../share/share.service';
import { SocialExportService } from '../share/social-export.service';
import { CombinationsService } from '../combinations/combinations.service';
import { FixturesService } from '../fixtures/fixtures.service';
import { DataStatusService } from '../data-status/data-status.service';
import { TrackRecordService } from '../track-record/track-record.service';
import { JobRunnerService } from '../sync/job-runner.service';
import { SyncJobsService } from '../sync/sync-jobs.service';
import { QueueService } from '../sync/queue.service';

const SERVICES = [
  EntityResolverService,
  IngestionService,
  CatalogService,
  PredictionsService,
  PublicationPolicyService,
  ModelMetricsService,
  ValueBetsService,
  SettlementService,
  LiveEventsService,
  SponsorService,
  AffiliateService,
  ChallengesService,
  ShareService,
  SocialExportService,
  CombinationsService,
  FixturesService,
  DataStatusService,
  TrackRecordService,
  JobRunnerService,
  SyncJobsService,
  QueueService,
];

/** Servicios de dominio compartidos por la API HTTP, el worker y el CLI. */
@Global()
@Module({
  imports: [AppConfigModule, PrismaModule, ProvidersModule],
  providers: SERVICES,
  exports: SERVICES,
})
export class CoreModule {}
