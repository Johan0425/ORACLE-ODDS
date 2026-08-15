import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * No se llama a $connect() explícitamente: Prisma conecta de forma perezosa en la
 * primera query, así que el bootstrap de Nest no depende de que Postgres esté
 * disponible en el momento de arrancar el proceso.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
