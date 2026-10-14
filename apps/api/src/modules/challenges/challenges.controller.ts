import { Body, Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { anonymousSessionHash } from '../../common/anonymous';
import { ChallengesService } from './challenges.service';
import { CHALLENGE_FORMATS, SCORING_SYSTEMS, type ScoringRules } from './scoring';

class ScoringDto {
  @IsIn(SCORING_SYSTEMS as unknown as string[]) system!: ScoringRules['system'];
  @IsIn(CHALLENGE_FORMATS as unknown as string[]) format!: ScoringRules['format'];
  @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) allowedMarkets!: string[];
}

export class CreateChallengeDto {
  @IsString() @MinLength(3) @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsString({ each: true }) fixtureIds!: string[];
  @IsOptional() @IsISO8601() endsAt?: string;
  @ValidateNested() @Type(() => ScoringDto) scoring!: ScoringDto;
  @IsOptional() @IsInt() @Min(2) @Max(500) maxParticipants?: number;
  @IsOptional() @IsInt() @Min(1) @Max(60) maxPicksPerEntry?: number;
  @IsOptional() @IsBoolean() withSponsor?: boolean;
  @IsOptional() @IsString() @MaxLength(2048) captchaToken?: string;
}

export class JoinChallengeDto {
  @IsString() @MinLength(3) @MaxLength(20) alias!: string;
}

class PickDto {
  @IsString() @MaxLength(40) fixtureId!: string;
  @IsString() @Matches(/^[A-Z0-9_]{1,16}$/) marketKey!: string;
  @IsString() @Matches(/^[A-Z_]{1,12}$|^\d{1,2}-\d{1,2}$/) selectionKey!: string;
  @IsOptional() @IsNumber() line?: number | null;
}

export class PicksDto {
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => PickDto) picks!: PickDto[];
}

export class ModerateDto {
  @IsString() @MaxLength(20) alias!: string;
  @IsBoolean() hidden!: boolean;
}

export class ReportDto {
  @IsString() @MinLength(3) @MaxLength(200) reason!: string;
}

@ApiTags('challenges')
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Crea un reto sin dinero real. Devuelve publicCode y creatorSecret (una sola vez)' })
  create(@Body() dto: CreateChallengeDto, @Req() req: Request) {
    return this.challenges.create(dto, anonymousSessionHash(req, this.env));
  }

  @Get(':code')
  get(@Param('code') code: string) {
    return this.challenges.get(code);
  }

  @Post(':code/join')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  join(@Param('code') code: string, @Body() dto: JoinChallengeDto) {
    return this.challenges.join(code, dto.alias);
  }

  @Post(':code/picks')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiHeader({ name: 'x-participant-token', required: true })
  picks(@Param('code') code: string, @Headers('x-participant-token') token: string, @Body() dto: PicksDto) {
    return this.challenges.submitPicks(code, token ?? '', dto.picks);
  }

  @Get(':code/me')
  @ApiHeader({ name: 'x-participant-token', required: true })
  me(@Param('code') code: string, @Headers('x-participant-token') token: string) {
    return this.challenges.myEntry(code, token ?? '');
  }

  @Get(':code/leaderboard')
  leaderboard(@Param('code') code: string) {
    return this.challenges.leaderboard(code);
  }

  @Post(':code/close')
  @ApiHeader({ name: 'x-creator-secret', required: true })
  close(@Param('code') code: string, @Headers('x-creator-secret') secret: string) {
    return this.challenges.close(code, secret ?? '');
  }

  @Post(':code/moderate')
  @ApiHeader({ name: 'x-creator-secret', required: true })
  moderate(@Param('code') code: string, @Headers('x-creator-secret') secret: string, @Body() dto: ModerateDto) {
    return this.challenges.moderateEntry(code, secret ?? '', dto.alias, dto.hidden);
  }

  @Post(':code/report')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  report(@Param('code') code: string, @Body() dto: ReportDto, @Req() req: Request) {
    return this.challenges.report(code, dto.reason, anonymousSessionHash(req, this.env));
  }
}
