import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler.guard';
import { env } from './config/env';
import { CoreModule } from './modules/core/core.module';
import { FixturesController } from './modules/fixtures/fixtures.controller';
import { CatalogController } from './modules/catalog/catalog.controller';
import { ValueBetsController } from './modules/value-bets/value-bets.controller';
import { CombinationsController } from './modules/combinations/combinations.controller';
import { ShareController } from './modules/share/share.controller';
import { ChallengesController } from './modules/challenges/challenges.controller';
import { AffiliateController } from './modules/affiliate/affiliate.controller';
import { AdminController } from './modules/admin/admin.controller';
import { AdminGuard } from './modules/admin/admin.guard';
import { DataStatusController, HealthController } from './modules/health/health.controller';
import { NewsletterController } from './modules/newsletter/newsletter.controller';
import { CronController } from './modules/cron/cron.controller';
import { DemoController } from './modules/demo/demo.controller';

/**
 * Proceso HTTP. No consume colas: el worker corre en un proceso aparte
 * (src/worker.ts) para no depender de BullMQ dentro de funciones serverless.
 */
@Module({
  imports: [CoreModule, ThrottlerModule.forRootAsync({ useFactory: () => [{ name: 'default', ttl: 60_000, limit: env().THROTTLE_GLOBAL_LIMIT }] })],
  controllers: [
    HealthController,
    DataStatusController,
    CatalogController,
    FixturesController,
    ValueBetsController,
    CombinationsController,
    ShareController,
    ChallengesController,
    AffiliateController,
    AdminController,
    NewsletterController,
    CronController,
    DemoController,
  ],
  providers: [AdminGuard, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
