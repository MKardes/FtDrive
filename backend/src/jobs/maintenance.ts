import type { FastifyBaseLogger } from 'fastify';
import type { Services } from '../services';
import { runRetentionSweep } from '../modules/trash/sweep';

const HOUR_MS = 60 * 60 * 1000;
/** Temp `.part` files older than this are orphans from interrupted uploads. */
const TEMP_MAX_AGE_MS = 24 * HOUR_MS;

/**
 * Background maintenance (T069): on startup and hourly, purge expired sessions,
 * sweep orphaned upload temp files, and permanently remove trash past its
 * retention deadline. Best-effort — failures are logged, never fatal. Returns a
 * stop function for graceful shutdown.
 */
export function startMaintenanceJobs(services: Services, log: FastifyBaseLogger): () => void {
  let stopped = false;

  const runAll = async (): Promise<void> => {
    if (stopped) return;
    try {
      const purgedSessions = services.sessions.purgeExpired();
      const sweptTemp = await services.storage.sweepTempFiles(TEMP_MAX_AGE_MS);
      const sweptTrash = await runRetentionSweep(services);
      const sweptShares = services.shares.deleteExpired(Date.now());
      log.info(
        { event: 'maintenance.sweep', purgedSessions, sweptTemp, sweptTrash, sweptShares },
        'maintenance sweep complete',
      );
    } catch (err) {
      log.error({ err, event: 'maintenance.sweep' }, 'maintenance sweep failed');
    }
  };

  void runAll(); // run once at startup
  const timer = setInterval(() => void runAll(), HOUR_MS);
  timer.unref?.(); // don't keep the process alive for the timer alone

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
