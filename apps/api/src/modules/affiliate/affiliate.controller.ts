import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { anonymousSessionHash } from '../../common/anonymous';
import { AffiliateService } from './affiliate.service';
import { SponsorService } from './sponsor.service';

export class ClickDto {
  @IsString() @Matches(/^[a-z0-9-]{2,40}$/) bookmaker!: string;
  @IsString() @Matches(/^[a-z0-9_:-]{2,40}$/) placement!: string;
  @IsOptional() @IsString() @MaxLength(40) fixtureId?: string;
  @IsOptional() @IsString() @MaxLength(40) valueBetId?: string;
  @IsOptional() @IsString() @MaxLength(300) referrer?: string;
  @IsOptional() @IsString() @MaxLength(80) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(80) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(80) utmCampaign?: string;
}

export class ImpressionDto {
  @IsString() @Matches(/^[a-z0-9_:-]{2,40}$/) placement!: string;
  @IsString() @Matches(/^[a-z0-9-]{2,40}$/) bookmaker!: string;
}

export class PostbackDto {
  @IsString() @MaxLength(60) clickId!: string;
  @IsString() @MaxLength(40) event!: string;
  @IsString() @MaxLength(120) externalRef!: string;
  @IsOptional() @IsInt() @Min(0) payoutCents?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

@ApiTags('affiliate')
@Controller()
export class AffiliateController {
  constructor(private readonly affiliate: AffiliateService, private readonly sponsor: SponsorService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('sponsor/config')
  @ApiOperation({ summary: 'Configuración pública del patrocinador para una ubicación (feature flag central)' })
  config(@Query('placement') placement = 'landing') {
    return this.sponsor.publicConfig(placement);
  }

  @Post('affiliate/click')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registra un clic server-side y devuelve la URL de destino con UTM/subID/clickID' })
  click(@Body() dto: ClickDto, @Req() req: Request) {
    return this.affiliate.click(dto, anonymousSessionHash(req, this.env));
  }

  /** Variante sin JavaScript: registra y redirige (302). */
  @Get('affiliate/go')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async go(@Query() q: ClickDto, @Req() req: Request, @Res() res: Response) {
    const r = await this.affiliate.click(q, anonymousSessionHash(req, this.env));
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, r.redirectUrl);
  }

  @Post('affiliate/impression')
  @HttpCode(204)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async impression(@Body() dto: ImpressionDto) {
    await this.affiliate.impression(dto.placement, dto.bookmaker);
  }

  @Post('affiliate/postback')
  @ApiOperation({ summary: 'Postback firmado de conversión (solo si el operador lo documenta oficialmente)' })
  postback(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-signature') signature: string | undefined, @Body() dto: PostbackDto) {
    return this.affiliate.postback(req.rawBody?.toString('utf8') ?? JSON.stringify(dto), signature, dto);
  }
}
