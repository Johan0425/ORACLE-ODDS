import { Module } from '@nestjs/common';
import { ProbabilitiesController } from './probabilities.controller';
import { ProbabilitiesService } from './probabilities.service';

@Module({
  controllers: [ProbabilitiesController],
  providers: [ProbabilitiesService],
})
export class ProbabilitiesModule {}
