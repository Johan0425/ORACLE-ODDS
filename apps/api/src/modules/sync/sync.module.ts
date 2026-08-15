import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MockFootballAdapter } from '../../providers/football/mock-football.adapter';
import { FOOTBALL_PROVIDER } from '../../providers/football/football-provider.interface';
import { PrismaQuotaStore } from './quota.store';
import { SyncFixturesProcessor } from './sync.processor';
import { SyncScheduler } from './sync.scheduler';

@Module({
  imports: [BullModule.registerQueue({ name: 'sync-fixtures' })],
  providers: [
    // Swap a `ApiFootballAdapter` cuando haya API key real (punto 7: roadmap de escalamiento) —
    // ningún otro módulo depende de esta clase concreta, solo del token FOOTBALL_PROVIDER.
    { provide: FOOTBALL_PROVIDER, useClass: MockFootballAdapter },
    PrismaQuotaStore,
    SyncFixturesProcessor,
    SyncScheduler,
  ],
})
export class SyncModule {}
