import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { resolveRedisConnection } from './common/redis-connection';
import { PrismaModule } from './prisma/prisma.module';
import { SportsModule } from './modules/sports/sports.module';
import { LeaguesModule } from './modules/leagues/leagues.module';
import { TeamsModule } from './modules/teams/teams.module';
import { FixturesModule } from './modules/fixtures/fixtures.module';
import { ProbabilitiesModule } from './modules/probabilities/probabilities.module';
import { ValueFinderModule } from './modules/value-finder/value-finder.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({ connection: resolveRedisConnection() }),
    PrismaModule,
    SportsModule,
    LeaguesModule,
    TeamsModule,
    FixturesModule,
    ProbabilitiesModule,
    ValueFinderModule,
    AuthModule,
    UsersModule,
    SyncModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
