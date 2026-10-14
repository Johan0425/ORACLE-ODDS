import { Module } from '@nestjs/common';
import { CoreModule } from './modules/core/core.module';
import { WorkerService } from './modules/sync/queue.service';

/** Proceso worker persistente: consume colas BullMQ y programa los jobs repetibles. */
@Module({
  imports: [CoreModule],
  providers: [WorkerService],
})
export class WorkerModule {}
