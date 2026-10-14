import { BadRequestException, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256 } from '../../common/hashing';
import { AdminGuard } from '../admin/admin.guard';
import { DEMO_STEPS, DemoService, type DemoStep } from './demo.service';

/** Carga/borrado del demo. Requiere `x-admin-secret` y DEMO_MODE=true. */
@ApiExcludeController()
@SkipThrottle()
@UseGuards(AdminGuard)
@Controller('admin/demo')
export class DemoController {
  constructor(private readonly demo: DemoService, private readonly prisma: PrismaService) {}

  @Post(':step')
  async run(@Param('step') step: string, @Headers('x-admin-secret') secret: string) {
    if (!(DEMO_STEPS as readonly string[]).includes(step)) throw new BadRequestException(`Paso inválido. Usa: ${DEMO_STEPS.join(', ')}`);
    await this.prisma.adminAuditLog.create({ data: { action: `demo:${step}`, actorHash: sha256(secret).slice(0, 12) } });
    return this.demo.run(step as DemoStep);
  }
}
