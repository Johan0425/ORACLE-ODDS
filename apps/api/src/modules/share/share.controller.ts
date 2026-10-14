import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { ShareService, SHARE_ENTITY_TYPES, SHARE_FORMATS, type ShareFormat } from './share.service';

export class CreateShareDto {
  @IsIn(SHARE_ENTITY_TYPES as unknown as string[]) entityType!: string;
  @IsString() @MaxLength(40) entityId!: string;
  @IsIn(SHARE_FORMATS as unknown as string[]) format!: ShareFormat;
  @IsOptional() @IsString() @MaxLength(30) template?: string;
  @IsOptional() @IsBoolean() showSponsor?: boolean;
}

@ApiTags('share')
@Controller()
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Post('share-assets')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Crea una pieza compartible (snapshot con cuota refrescada y código corto)' })
  create(@Body() dto: CreateShareDto) {
    return this.share.create(dto);
  }

  @Get('share/:code')
  get(@Param('code') code: string) {
    return this.share.get(code);
  }
}
