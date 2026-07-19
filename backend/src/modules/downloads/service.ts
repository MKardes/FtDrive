import type { AppConfig } from '../../config/index';
import type { DownloadRow } from '../../db/schema';
import { assertUrlAllowed } from '../../lib/url-guard';
import { conflict, serviceUnavailable, validationError } from '../../lib/errors';
import type { NodeRepository } from '../nodes/repository';
import { DrmProtectedError, Extractor, SourceInaccessibleError, type ProbeResult } from './extractor';
import { DownloadPipeline, resolveSelection } from './pipeline';
import { DownloadRepository, toDownloadDto, type DownloadDto, type Page } from './repository';
import type { DownloadWorkerPool } from './worker';

export interface DownloadServiceDeps {
  repository: DownloadRepository;
  pipeline: DownloadPipeline;
  extractor: Extractor;
  nodes: NodeRepository;
  worker: DownloadWorkerPool;
  config: AppConfig;
}

/**
 * `DownloadService` (T015): orchestrates the downloads domain for the routes.
 * Every accessor goes through `repository.getOwnedDownloadOrThrow404` (via the
 * repository's owner-scoped methods), so a non-owned or non-existent download
 * always yields the same 404 (Principle II).
 */
export class DownloadService {
  constructor(private readonly deps: DownloadServiceDeps) {}

  async assertAvailable(): Promise<void> {
    if (!this.deps.config.downloadsEnabled) throw serviceUnavailable('Downloads are disabled');
    const ok = await this.deps.extractor.isAvailable();
    if (!ok) throw serviceUnavailable('The download engine is unavailable on this host');
  }

  /** Bounded, side-effect-free examination (FR-001/002). Never creates a job. */
  async examineUrl(url: string): Promise<ProbeResult> {
    await this.assertAvailable();
    const timeoutMs = this.deps.config.downloadExamineTimeoutMs;
    const timeout = new Promise<ProbeResult>((resolvePromise) => {
      const t = setTimeout(
        () => resolvePromise({ videoFound: false, directFile: false, candidates: [] }),
        timeoutMs,
      );
      t.unref?.();
    });
    // `pipeline.examine` also returns the internal download `targets`; the wire
    // examine result is only the three fields the contract pins (api-delta.md).
    const result = await Promise.race([this.deps.pipeline.examine(url), timeout]);
    return { videoFound: result.videoFound, directFile: result.directFile, candidates: result.candidates };
  }

  /**
   * Enqueue a durable job (FR-005/007). Validates the URL (SSRF, 400) and the
   * destination (owned live folder, uniform 404) synchronously; a best-effort
   * probe checks the per-download size ceiling and the caller's remaining
   * storage quota (409) when a size estimate is available. A probe failure
   * here is NOT fatal to creation — the worker discovers and reports the real
   * failure reason (e.g. no video / DRM) asynchronously via the job's status,
   * which is what lets a direct-file URL (FR-004) enqueue instantly.
   */
  async createDownload(
    ownerId: string,
    input: { url: string; destinationFolderId?: string | null; formatId?: string | null },
  ): Promise<DownloadDto> {
    await this.assertAvailable();
    await assertUrlAllowed(input.url, this.deps.config);

    if (input.destinationFolderId) {
      this.deps.nodes.resolveOwnedFolderOrThrow404(ownerId, input.destinationFolderId);
    }

    await this.checkCapsPreflight(ownerId, input.url, input.formatId ?? null);

    const row = this.deps.repository.insert({
      ownerId,
      sourceUrl: input.url,
      destinationParentId: input.destinationFolderId ?? null,
      selection: input.formatId ?? null,
    });
    return this.toDtoEnriched(row);
  }

  private async checkCapsPreflight(ownerId: string, url: string, formatId: string | null): Promise<void> {
    let probe: ProbeResult;
    try {
      probe = await this.deps.pipeline.examine(url);
    } catch (err) {
      if (err instanceof DrmProtectedError || err instanceof SourceInaccessibleError) return; // let the worker report it
      return;
    }
    if (!probe.videoFound || probe.candidates.length === 0) return;

    if (formatId) {
      const found = probe.candidates.some((c) => c.formats.some((f) => f.formatId === formatId));
      if (!found) throw validationError('Unknown formatId — it may have expired; examine the URL again');
    }

    const { format } = resolveSelection(probe.candidates, formatId);
    if (!format?.estimatedBytes) return;

    if (format.estimatedBytes > this.deps.config.downloadMaxBytes) {
      throw conflict('The video exceeds the maximum allowed download size');
    }
    const quota = this.deps.config.userStorageQuotaBytes;
    if (quota > 0) {
      const used = this.deps.nodes.sumLiveFileSizes(ownerId);
      const remaining = quota - used;
      if (format.estimatedBytes > remaining) throw conflict('This would exceed your storage quota');
    }
  }

  listDownloads(
    ownerId: string,
    opts: { cursor?: string; limit?: number; status?: 'active' | 'terminal' },
  ): Page<DownloadDto> {
    const page = this.deps.repository.listByOwner(ownerId, opts);
    return { items: page.items.map((r) => this.toDtoEnriched(r)), nextCursor: page.nextCursor };
  }

  getDownload(ownerId: string, id: string): DownloadDto {
    return this.toDtoEnriched(this.deps.repository.getOwnedDownloadOrThrow404(ownerId, id));
  }

  cancelDownload(ownerId: string, id: string): DownloadDto {
    const row = this.deps.repository.cancelIfNotTerminal(ownerId, id);
    this.deps.worker.requestCancel(id);
    return this.toDtoEnriched(row);
  }

  async retryDownload(ownerId: string, id: string): Promise<DownloadDto> {
    await this.assertAvailable();
    const row = this.deps.repository.retryFromTerminal(ownerId, id);
    return this.toDtoEnriched(row);
  }

  clearHistory(ownerId: string): void {
    this.deps.repository.clearTerminalForOwner(ownerId);
  }

  deleteOne(ownerId: string, id: string): void {
    this.deps.repository.deleteOneTerminal(ownerId, id);
  }

  private toDtoEnriched(row: DownloadRow): DownloadDto {
    let nodePresent: boolean | null = null;
    if (row.nodeId) {
      const node = this.deps.nodes.getOwnedNode(row.ownerId, row.nodeId);
      nodePresent = !!node && node.trashedAt === null;
    }
    return toDownloadDto(row, nodePresent);
  }
}
