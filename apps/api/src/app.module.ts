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

// El worker de BullMQ (`SyncModule`) asume un proceso persistente escuchando la
// cola — no encaja en el modelo serverless de Vercel Functions (invocación
// corta, sin instancia "siempre viva" garantizada). ENABLE_SYNC_WORKER=true en
// un runtime de proceso largo (Docker/Colima local, o un futuro host con
// contenedor) lo activa; en Vercel se deja desactivado.
const syncWorkerEnabled = process.env.ENABLE_SYNC_WORKER === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...(syncWorkerEnabled ? [BullModule.forRoot({ connection: resolveRedisConnection() })] : []),
    PrismaModule,
    SportsModule,
    LeaguesModule,
    TeamsModule,
    FixturesModule,
    ProbabilitiesModule,
    ValueFinderModule,
    AuthModule,
    UsersModule,
    ...(syncWorkerEnabled ? [SyncModule] : []),
  ],
  controllers: [AppController],
})
export class AppModule {}
