import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../../config/index';
import type { DownloadRow } from '../../db/schema';
import type { DownloadPipeline } from './pipeline';
import type { DownloadRepository } from './repository';

const TICK_MS = 300;

/**
 * In-process worker pool (research.md §3): on an interval, claims queued jobs
 * (the repository enforces the per-user concurrency cap) and runs them through
 * the pipeline. Tracks an `AbortController` per in-flight job so a user's
 * cancel request (FR-008) can stop the actual transfer promptly, not just flip
 * a DB flag.
 */
export class DownloadWorkerPool {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly deps: {
      repository: DownloadRepository;
      pipeline: DownloadPipeline;
      config: AppConfig;
      log: FastifyBaseLogger;
    },
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }

  /** Abort an in-flight job's transfer (called by the service right after the DB flip to `canceled`). */
  requestCancel(downloadId: string): boolean {
    const controller = this.controllers.get(downloadId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    // Claim everything currently claimable; the repository's per-user cap bounds how much actually starts.
    for (;;) {
      if (this.stopped) return;
      let job: DownloadRow | undefined;
      try {
        job = this.deps.repository.claimNextQueued(this.deps.config.downloadMaxConcurrencyPerUser);
      } catch (err) {
        this.deps.log.error({ err, event: 'downloads.worker.claim_failed' }, 'failed to claim a queued download');
        return;
      }
      if (!job) return;
      this.runJob(job);
    }
  }

  private runJob(job: DownloadRow): void {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.deps.pipeline
      .run(job, controller.signal)
      .catch((err: unknown) => {
        this.deps.log.error(
          { err, event: 'downloads.worker.unhandled', downloadId: job.id },
          'download job failed unexpectedly',
        );
      })
      .finally(() => {
        this.controllers.delete(job.id);
      });
  }
}
