import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { randomSecret } from '../../common/hashing';

const CONSENT_TEXT =
  'Acepto recibir el boletín de ORACLE ODDS con análisis estadísticos. Soy mayor de 18 años. Puedo darme de baja en cualquier momento.';

export class SubscribeDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsBoolean() @Equals(true, { message: 'Se requiere consentimiento explícito' }) consent!: boolean;
  @IsBoolean() @Equals(true, { message: 'Solo para mayores de 18 años' }) isAdult!: boolean;
}

/**
 * Newsletter opt-in con doble confirmación. El envío de correos requiere un
 * proveedor transaccional (no incluido); el token se devuelve para que la capa
 * de envío lo use en el enlace de confirmación.
 */
@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('subscribe')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Suscripción opt-in (requiere confirmación)' })
  async subscribe(@Body() dto: SubscribeDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscription.findUnique({ where: { email } });
    if (existing?.confirmedAt && !existing.unsubscribedAt) return { status: 'already_subscribed' };
    const confirmToken = randomSecret(18);
    await this.prisma.newsletterSubscription.upsert({
      where: { email },
      create: { email, confirmToken, consentText: CONSENT_TEXT },
      update: { confirmToken, consentText: CONSENT_TEXT, unsubscribedAt: null },
    });
    return { status: 'pending_confirmation', consentText: CONSENT_TEXT };
  }

  @Get('confirm')
  async confirm(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Token requerido');
    const sub = await this.prisma.newsletterSubscription.findUnique({ where: { confirmToken: token } });
    if (!sub) throw new NotFoundException('Token inválido');
    await this.prisma.newsletterSubscription.update({ where: { id: sub.id }, data: { confirmedAt: new Date() } });
    return { status: 'confirmed' };
  }

  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string) {
    const sub = token ? await this.prisma.newsletterSubscription.findUnique({ where: { confirmToken: token } }) : null;
    if (!sub) throw new NotFoundException('Token inválido');
    await this.prisma.newsletterSubscription.update({ where: { id: sub.id }, data: { unsubscribedAt: new Date() } });
    return { status: 'unsubscribed' };
  }
}
