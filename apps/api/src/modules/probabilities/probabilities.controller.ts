import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProbabilitiesService } from './probabilities.service';

@Controller('fixtures/:fixtureId/probabilities')
export class ProbabilitiesController {
  constructor(private readonly probabilitiesService: ProbabilitiesService) {}

  @Get()
  forFixture(@Param('fixtureId') fixtureId: string, @Query('market') market?: string) {
    return this.probabilitiesService.forFixture(fixtureId, market);
  }
}
