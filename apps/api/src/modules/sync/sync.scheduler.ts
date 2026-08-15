import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** IDs externos de ejemplo (Premier League, LaLiga, Serie A) — reemplazar por la lista real de ligas trackeadas. */
const TRACKED_LEAGUES = ['39', '140', '135'];

/** Registra el job repetible `sync:fixtures:daily` (cron `0 6 * * *`) del plan del punto 6. */
@Injectable()
export class SyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(SyncScheduler.name);

  constructor(@InjectQueue('sync-fixtures') private readonly fixturesQueue: Queue) {}

  /**
   * No se espera (`await`) el registro en el propio hook de ciclo de vida: Nest
   * bloquea `app.listen()` hasta que todos los `onModuleInit` resuelven, así que
   * si Redis está caído, esto tumbaría TODA la API (incluidos endpoints públicos
   * que no dependen de BullMQ) en vez de solo la sincronización.
   */
  onModuleInit() {
    void this.registerRepeatableJobs();
  }

  private async registerRepeatableJobs() {
    for (const leagueExternalId of TRACKED_LEAGUES) {
      try {
        await this.fixturesQueue.add(
          `fixtures-${leagueExternalId}`,
          { leagueExternalId },
          { repeat: { pattern: '0 6 * * *' }, jobId: `fixtures-${leagueExternalId}` },
        );
      } catch (error) {
        this.logger.warn(`No se pudo registrar el job de ${leagueExternalId}: ${(error as Error).message}`);
      }
    }
  }
}
