import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../../config/index';
import type { DownloadRow } from '../../db/schema';
import { assertUrlAllowed } from '../../lib/url-guard';
import type { Storage } from '../../storage/index';
import { isVideoMime, type MediaService } from '../../media/index';
import { sanitizeUploadName } from '../nodes/names';
import { NodeRepository } from '../nodes/repository';
import type { BrowserProbeLike } from './browser-probe';
import {
  DrmProtectedError,
  Extractor,
  SourceInaccessibleError,
  type ExtractorCandidate,
  type ExtractorFormat,
  type ProbeResult,
} from './extractor';
import { DownloadRepository } from './repository';

/**
 * Orchestration used by the worker (research.md §6, data-model.md state
 * machine): `examine()` = url-guard → static probe → (nothing found) headless
 * fallback → url-guard the discovered URL → re-probe. `run()` re-resolves the
 * chosen format fresh (metadata/URLs can expire) and downloads it, finalizing
 * through the existing atomic temp→rename→commit path so a node is created
 * ONLY on full success (FR-010) — cancel/fail/exception always discard the
 * scratch file first.
 */

const PROGRESS_PERSIST_INTERVAL_MS = 900;
const WATCHDOG_TICK_MS = 250;

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  flv: 'video/x-flv',
};

export interface PipelineDeps {
  extractor: Extractor;
  browserProbe: BrowserProbeLike;
  storage: Storage;
  nodes: NodeRepository;
  media: MediaService;
  downloads: DownloadRepository;
  config: AppConfig;
  log: FastifyBaseLogger;
}

export class DownloadPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /** Static-first, headless-fallback examination (FR-001/002/019). No side effects. */
  async examine(url: string): Promise<ProbeResult> {
    await assertUrlAllowed(url, this.deps.config);

    const direct = await this.deps.extractor.probe(url, { timeoutMs: this.deps.config.downloadExamineTimeoutMs });
    if (direct.videoFound) return direct;

    const discovery = await this.deps.browserProbe.discover(
      url,
      this.deps.config,
      this.deps.config.downloadExamineTimeoutMs,
    );
    for (const candidateUrl of discovery.discoveredUrls) {
      try {
        const result = await this.deps.extractor.probe(candidateUrl, {
          timeoutMs: this.deps.config.downloadExamineTimeoutMs,
        });
        if (result.videoFound) return result;
      } catch {
        // This discovered URL didn't pan out — try the next one.
      }
    }
    return { videoFound: false, directFile: false, candidates: [] };
  }

  /** Ensure the user's default "Downloads" folder exists (FR-003), racy-create safe. */
  ensureDownloadsFolder(ownerId: string): { id: string } {
    const root = this.deps.nodes.ensureRootNode(ownerId);
    const existing = this.findDownloadsFolder(ownerId, root.id);
    if (existing) return existing;
    try {
      const created = this.deps.nodes.insertFolderNode({ ownerId, parentId: root.id, name: 'Downloads' });
      return { id: created.id };
    } catch (err) {
      // Lost a race with another concurrent download creating the same folder.
      const winner = this.findDownloadsFolder(ownerId, root.id);
      if (winner) return winner;
      throw err;
    }
  }

  private findDownloadsFolder(ownerId: string, rootId: string): { id: string } | undefined {
    const page = this.deps.nodes.listChildren(ownerId, rootId, { limit: 200 });
    const found = page.items.find((n) => n.type === 'folder' && n.name === 'Downloads');
    return found ? { id: found.id } : undefined;
  }

  /** Run one claimed job end-to-end (`examining` → `downloading` → terminal). Never throws. */
  async run(job: DownloadRow, signal: AbortSignal): Promise<void> {
    const { downloads: repo, config, log } = this.deps;

    let probe: ProbeResult;
    try {
      probe = await this.examine(job.sourceUrl);
    } catch (err) {
      const code = err instanceof DrmProtectedError ? 'DRM_PROTECTED' : 'SOURCE_UNAVAILABLE';
      repo.markFailed(job.id, code, messageOf(err));
      return;
    }

    if (!probe.videoFound || probe.candidates.length === 0) {
      repo.markFailed(job.id, 'NO_VIDEO_FOUND', 'No downloadable video was found at that URL.');
      return;
    }

    const { candidate, format } = resolveSelection(probe.candidates, job.selection);
    if (!format) {
      repo.markFailed(job.id, 'NO_VIDEO_FOUND', 'No downloadable format was available for that video.');
      return;
    }

    if (format.estimatedBytes != null && format.estimatedBytes > config.downloadMaxBytes) {
      repo.markFailed(job.id, 'SIZE_LIMIT', 'The video exceeds the maximum allowed download size.');
      return;
    }

    let destFolderId: string;
    try {
      destFolderId = job.destinationParentId
        ? this.deps.nodes.resolveOwnedFolderOrThrow404(job.ownerId, job.destinationParentId).id
        : this.ensureDownloadsFolder(job.ownerId).id;
    } catch {
      repo.markFailed(job.id, 'DESTINATION_UNAVAILABLE', 'The destination folder is no longer available.');
      return;
    }

    repo.markDownloading(job.id, { title: candidate.title, totalBytes: format.estimatedBytes });

    const tmpDir = this.deps.storage.tmpDir(job.ownerId);
    await mkdir(tmpDir, { recursive: true });
    const scratchPath = join(tmpDir, `ytdlp-${job.id}.part`);

    const outcome = await this.downloadToScratch(job, format, scratchPath, signal);
    if (outcome.kind !== 'success') {
      await this.deps.storage.discardTemp(scratchPath);
      if (outcome.kind === 'canceled') return; // service already recorded the cancel
      repo.markFailed(job.id, outcome.errorCode, outcome.errorMessage);
      return;
    }

    try {
      // Re-check the destination is still live right before we make the file visible (edge case: deleted mid-download).
      destFolderId = job.destinationParentId
        ? this.deps.nodes.resolveOwnedFolderOrThrow404(job.ownerId, job.destinationParentId).id
        : this.ensureDownloadsFolder(job.ownerId).id;
    } catch {
      await this.deps.storage.discardTemp(scratchPath);
      repo.markFailed(job.id, 'DESTINATION_UNAVAILABLE', 'The destination folder is no longer available.');
      return;
    }

    try {
      const { size } = await stat(scratchPath);
      const { storagePath } = await this.deps.storage.commitTemp(job.ownerId, scratchPath);
      const mimeType = format.ext ? (VIDEO_MIME_BY_EXT[format.ext.toLowerCase()] ?? null) : null;
      const desiredName = sanitizeUploadName(`${candidate.title ?? 'video'}.${format.ext ?? 'mp4'}`);
      const name = this.deps.nodes.resolveAvailableName(job.ownerId, destFolderId, desiredName);
      const node = this.deps.nodes.insertFileNode({
        ownerId: job.ownerId,
        parentId: destFolderId,
        name,
        size,
        mimeType,
        storagePath,
        thumbStatus: isVideoMime(mimeType) ? 'pending' : 'none',
      });
      repo.markCompleted(job.id, node.id);

      if (isVideoMime(mimeType)) {
        const status = await this.deps.media.ensureThumbnail(job.ownerId, node);
        this.deps.nodes.setThumbStatus(job.ownerId, node.id, status === 'unavailable' ? 'pending' : status);
      }
    } catch (err) {
      log.error({ err, event: 'downloads.finalize_failed', downloadId: job.id }, 'failed to finalize a completed download');
      repo.markFailed(job.id, 'SOURCE_UNAVAILABLE', 'The download finished but could not be saved.');
    }
  }

  private downloadToScratch(
    job: DownloadRow,
    format: ExtractorFormat,
    scratchPath: string,
    signal: AbortSignal,
  ): Promise<
    | { kind: 'success' }
    | { kind: 'canceled' }
    | { kind: 'failed'; errorCode: string; errorMessage: string }
  > {
    const { extractor, downloads: repo, config } = this.deps;
    return new Promise((resolvePromise) => {
      let abortReason: 'canceled' | 'size' | 'time' | null = null;
      let lastPersist = 0;

      const handle = extractor.download(job.sourceUrl, format.formatId, scratchPath, (bytes, total) => {
        const now = Date.now();
        if (now - lastPersist > PROGRESS_PERSIST_INTERVAL_MS) {
          lastPersist = now;
          repo.setProgress(job.id, bytes, total ?? undefined);
        }
        if (bytes > config.downloadMaxBytes && abortReason === null) {
          abortReason = 'size';
          handle.abort();
        }
      });

      const onExternalAbort = () => {
        if (abortReason === null) abortReason = 'canceled';
        handle.abort();
      };
      signal.addEventListener('abort', onExternalAbort);
      if (signal.aborted) onExternalAbort();

      const startedAt = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - startedAt > config.downloadMaxDurationMs && abortReason === null) {
          abortReason = 'time';
          handle.abort();
        }
      }, WATCHDOG_TICK_MS);
      watchdog.unref?.();

      const cleanup = () => {
        clearInterval(watchdog);
        signal.removeEventListener('abort', onExternalAbort);
      };

      handle.done.then(
        () => {
          cleanup();
          resolvePromise({ kind: 'success' });
        },
        (err: unknown) => {
          cleanup();
          if (abortReason === 'canceled') {
            resolvePromise({ kind: 'canceled' });
          } else if (abortReason === 'size') {
            resolvePromise({ kind: 'failed', errorCode: 'SIZE_LIMIT', errorMessage: 'The video exceeds the maximum allowed download size.' });
          } else if (abortReason === 'time') {
            resolvePromise({ kind: 'failed', errorCode: 'TIME_LIMIT', errorMessage: 'The download took too long and was stopped.' });
          } else {
            resolvePromise({ kind: 'failed', errorCode: 'SOURCE_UNAVAILABLE', errorMessage: messageOf(err) });
          }
        },
      );
    });
  }
}

export function resolveSelection(
  candidates: ExtractorCandidate[],
  selection: string | null,
): { candidate: ExtractorCandidate; format: ExtractorFormat | undefined } {
  if (selection) {
    for (const candidate of candidates) {
      const format = candidate.formats.find((f) => f.formatId === selection);
      if (format) return { candidate, format };
    }
  }
  const primary = candidates[0] as ExtractorCandidate;
  return { candidate: primary, format: bestFormat(primary.formats) };
}

function bestFormat(formats: ExtractorFormat[]): ExtractorFormat | undefined {
  if (formats.length === 0) return undefined;
  return [...formats].sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.estimatedBytes ?? 0) - (a.estimatedBytes ?? 0),
  )[0];
}

function messageOf(err: unknown): string {
  if (err instanceof SourceInaccessibleError) return err.message;
  return 'The source could not be downloaded. It may be offline or no longer available.';
}
