import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { H2hController } from './h2h.controller';
import { TeamsService } from './teams.service';

@Module({
  controllers: [TeamsController, H2hController],
  providers: [TeamsService],
})
export class TeamsModule {}
