import { Module } from '@nestjs/common';
import { ValueFinderController } from './value-finder.controller';
import { ValueFinderService } from './value-finder.service';

@Module({
  controllers: [ValueFinderController],
  providers: [ValueFinderService],
})
export class ValueFinderModule {}
