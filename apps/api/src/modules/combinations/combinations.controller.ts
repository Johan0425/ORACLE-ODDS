import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CombinationsService } from './combinations.service';

export class LegDto {
  @IsString() @MaxLength(40) fixtureId!: string;
  @IsString() @Matches(/^[A-Z0-9_]{1,16}$/) marketKey!: string;
  @IsString() @Matches(/^[A-Z_]{1,12}$|^\d{1,2}-\d{1,2}$/) selectionKey!: string;
  @IsOptional() @IsNumber() line?: number | null;
  @IsOptional() @IsNumber() @Min(1.01) @Max(1000) odds?: number;
  @IsOptional() @IsString() @MaxLength(40) bookmaker?: string;
}

export class AnalyzeCombinationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => LegDto) legs!: LegDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsInt({ each: true }) @Min(2, { each: true }) systemSizes?: number[];
  @IsOptional() @IsNumber() @Min(0.1) @Max(100) stakeUnits?: number;
  @IsOptional() @IsBoolean() save?: boolean;
}

@ApiTags('combinations')
@Controller('combinations')
export class CombinationsController {
  constructor(private readonly combos: CombinationsService) {}

  @Post('analyze')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Analiza sencillas, combinadas y sistemas k/n con cuotas refrescadas y correlación' })
  analyze(@Body() dto: AnalyzeCombinationDto) {
    return this.combos.analyze(dto);
  }

  @Get(':code')
  async get(@Param('code') code: string) {
    const c = await this.combos.get(code);
    if (!c) throw new NotFoundException('Combinada no encontrada');
    return c;
  }
}
