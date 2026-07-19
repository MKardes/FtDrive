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
  type StreamHeaders,
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

/**
 * One place `run()` can try to fetch the movie from (research R3/R4). For the
 * static/native path this is the submitted page itself (no special headers, yt-dlp
 * handles it). For embed-based movie sites it is a resolved stream URL plus the
 * request context that lets a protected fetch succeed. `probe` carries the
 * candidates already resolved during `examine()` so `run()` need not re-probe.
 */
export interface DownloadTarget {
  url: string;
  headers?: StreamHeaders;
  probe?: ProbeResult;
}

/** `examine()` result: the display probe (wire shape) plus the ordered targets to try. */
export interface ExamineResult extends ProbeResult {
  targets: DownloadTarget[];
}

/** A single synthesized candidate so a discovered-but-unprobed stream still lets the user proceed. */
function synthesizedProbe(): ProbeResult {
  return {
    videoFound: true,
    directFile: false,
    candidates: [
      {
        candidateId: 'stream',
        title: null,
        durationSec: null,
        formats: [{ formatId: 'best', quality: null, width: null, height: null, ext: null, estimatedBytes: null }],
      },
    ],
  };
}

export class DownloadPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /**
   * Static-first, headless-fallback examination (FR-001/002). No side effects.
   * Returns the display probe (wire shape) plus the ordered {@link DownloadTarget}s
   * `run()` will try — the submitted URL for the native path, or one target per
   * resolved embedded source (with its request context) for movie sites (R2–R4).
   */
  async examine(url: string): Promise<ExamineResult> {
    const { config } = this.deps;
    await assertUrlAllowed(url, config);

    const direct = await this.deps.extractor.probe(url, { timeoutMs: config.downloadExamineTimeoutMs });
    if (direct.videoFound) return { ...direct, targets: [{ url, probe: direct }] };

    const discovery = await this.deps.browserProbe.discover(url, config, {
      timeoutMs: config.downloadExamineTimeoutMs,
      playbackWaitMs: config.downloadPlaybackWaitMs,
      maxSources: config.downloadMaxSources,
    });

    const targets: DownloadTarget[] = [];
    let display: ProbeResult | null = null;
    for (const source of discovery.sources) {
      // Re-guard every discovered stream before we hand it to yt-dlp (research R7,
      // FR-010) — following embeds must never let the server fetch an internal address.
      try {
        await assertUrlAllowed(source.streamUrl, config);
      } catch {
        continue; // disallowed/internal — refuse it, never becomes a target
      }
      const target: DownloadTarget = { url: source.streamUrl, headers: source.headers };
      // Probe the first source(s) with context to populate the quality picker;
      // stop probing once we have a displayable result (the rest are run-time fallbacks).
      if (!display) {
        try {
          const probed = await this.deps.extractor.probe(source.streamUrl, {
            timeoutMs: config.downloadExamineTimeoutMs,
            context: source.headers,
          });
          if (probed.videoFound && probed.candidates.length > 0) {
            display = probed;
            target.probe = probed;
          }
        } catch {
          // This source didn't probe — still keep it as a run-time fallback target.
        }
      }
      targets.push(target);
    }

    if (targets.length === 0) return { videoFound: false, directFile: false, candidates: [], targets: [] };
    // A stream was discovered but formats couldn't be enumerated in budget — let the
    // user proceed; the worker re-resolves authoritatively (contracts behavioural note).
    return { ...(display ?? synthesizedProbe()), targets };
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

  /** Resolve the job's destination folder id (owned folder or auto-created "Downloads"). */
  private resolveDestination(job: DownloadRow): string {
    return job.destinationParentId
      ? this.deps.nodes.resolveOwnedFolderOrThrow404(job.ownerId, job.destinationParentId).id
      : this.ensureDownloadsFolder(job.ownerId).id;
  }

  /**
   * Run one claimed job end-to-end (`examining` → `downloading` → terminal). Never throws.
   * Iterates the examined {@link DownloadTarget}s in order (research R4, US2): the native
   * URL for ordinary pages, or each resolved embedded source for movie sites. The first
   * target that downloads wins; when several sources exist and all fail the job ends
   * `ALL_SOURCES_FAILED`. Every non-success attempt discards its scratch temp (FR-010).
   */
  async run(job: DownloadRow, signal: AbortSignal): Promise<void> {
    const { downloads: repo, config, log } = this.deps;

    let examined: ExamineResult;
    try {
      examined = await this.examine(job.sourceUrl);
    } catch (err) {
      // DRM / inaccessible (incl. geo-block, R9) are reported distinctly, never as a generic failure.
      const failure = failureFromError(err);
      repo.markFailed(job.id, failure.errorCode, failure.errorMessage);
      return;
    }

    if (examined.targets.length === 0) {
      repo.markFailed(job.id, 'NO_VIDEO_FOUND', 'No downloadable video was found at that URL.');
      return;
    }

    const tmpDir = this.deps.storage.tmpDir(job.ownerId);
    await mkdir(tmpDir, { recursive: true });

    let lastFailure: { errorCode: string; errorMessage: string } = {
      errorCode: 'NO_VIDEO_FOUND',
      errorMessage: 'No downloadable video was found at that URL.',
    };

    for (let i = 0; i < examined.targets.length; i += 1) {
      const target = examined.targets[i] as DownloadTarget;

      let probe = target.probe;
      if (!probe) {
        try {
          probe = await this.deps.extractor.probe(target.url, {
            timeoutMs: config.downloadExamineTimeoutMs,
            context: target.headers,
          });
        } catch (err) {
          lastFailure = failureFromError(err);
          continue; // this source didn't probe — try the next one
        }
      }
      if (!probe.videoFound || probe.candidates.length === 0) {
        lastFailure = { errorCode: 'NO_VIDEO_FOUND', errorMessage: 'No downloadable video was found at that URL.' };
        continue;
      }

      const { candidate, format } = resolveSelection(probe.candidates, job.selection);
      if (!format) {
        lastFailure = { errorCode: 'NO_VIDEO_FOUND', errorMessage: 'No downloadable format was available for that video.' };
        continue;
      }
      if (format.estimatedBytes != null && format.estimatedBytes > config.downloadMaxBytes) {
        lastFailure = { errorCode: 'SIZE_LIMIT', errorMessage: 'The video exceeds the maximum allowed download size.' };
        continue;
      }

      // A broken destination won't improve across sources — fail the whole job fast.
      let destFolderId: string;
      try {
        destFolderId = this.resolveDestination(job);
      } catch {
        repo.markFailed(job.id, 'DESTINATION_UNAVAILABLE', 'The destination folder is no longer available.');
        return;
      }

      repo.markDownloading(job.id, { title: candidate.title, totalBytes: format.estimatedBytes });

      const scratchPath = join(tmpDir, `ytdlp-${job.id}-${i}.part`);
      const outcome = await this.downloadToScratch(job, target, format, scratchPath, signal);
      if (outcome.kind === 'canceled') {
        await this.deps.storage.discardTemp(scratchPath);
        return; // service already recorded the cancel
      }
      if (outcome.kind !== 'success') {
        await this.deps.storage.discardTemp(scratchPath);
        lastFailure = { errorCode: outcome.errorCode, errorMessage: outcome.errorMessage };
        continue; // try the next source (US2)
      }

      // Re-check the destination is still live right before we make the file visible.
      try {
        destFolderId = this.resolveDestination(job);
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
      return; // completed (or terminally failed to finalize) — do not try more sources
    }

    // Every source failed. Distinguish the multi-source case (US2, FR-003) from a single target.
    if (examined.targets.length >= 2) {
      repo.markFailed(job.id, 'ALL_SOURCES_FAILED', "None of this page's video sources could be downloaded.");
    } else {
      repo.markFailed(job.id, lastFailure.errorCode, lastFailure.errorMessage);
    }
  }

  private downloadToScratch(
    job: DownloadRow,
    target: DownloadTarget,
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

      const handle = extractor.download(target.url, format.formatId, scratchPath, (bytes, total) => {
        const now = Date.now();
        if (now - lastPersist > PROGRESS_PERSIST_INTERVAL_MS) {
          lastPersist = now;
          repo.setProgress(job.id, bytes, total ?? undefined);
        }
        if (bytes > config.downloadMaxBytes && abortReason === null) {
          abortReason = 'size';
          handle.abort();
        }
      }, target.headers);

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

/** Classify a per-source probe error while iterating targets (research R9). */
function failureFromError(err: unknown): { errorCode: string; errorMessage: string } {
  if (err instanceof DrmProtectedError) return { errorCode: 'DRM_PROTECTED', errorMessage: err.message };
  if (err instanceof SourceInaccessibleError) return { errorCode: 'SOURCE_INACCESSIBLE', errorMessage: err.message };
  return { errorCode: 'SOURCE_UNAVAILABLE', errorMessage: messageOf(err) };
}
