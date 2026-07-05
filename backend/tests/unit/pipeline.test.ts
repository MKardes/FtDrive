import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadPipeline } from '../../src/modules/downloads/pipeline';
import type { ProbeResult } from '../../src/modules/downloads/extractor';
import type { DownloadRow } from '../../src/db/schema';

/**
 * Pipeline finalize/caps unit tests (T013, gating — research.md §11). Every
 * external boundary (extractor, browser-probe, storage, nodes, media,
 * repository) is a plain mock so these assert ONLY the pipeline's own
 * decision logic: a node is created exclusively after a simulated full
 * success, and any failure/cancel/size-breach discards the scratch temp and
 * creates nothing.
 */

function makeJob(overrides: Partial<DownloadRow> = {}): DownloadRow {
  return {
    id: 'job-1',
    ownerId: 'owner-1',
    sourceUrl: 'http://93.184.216.34/ok',
    destinationParentId: null,
    selection: null,
    title: null,
    status: 'examining',
    bytesDownloaded: 0,
    totalBytes: null,
    nodeId: null,
    errorCode: null,
    errorMessage: null,
    attempt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: Date.now(),
    finishedAt: null,
    ...overrides,
  };
}

const okProbe: ProbeResult = {
  videoFound: true,
  directFile: false,
  candidates: [
    {
      candidateId: 'c1',
      title: 'A Video',
      durationSec: 10,
      formats: [{ formatId: 'f1', quality: '720p', width: 1280, height: 720, ext: 'mp4', estimatedBytes: 100 }],
    },
  ],
};

describe('DownloadPipeline', () => {
  let tmpDir: string;
  let deps: {
    extractor: { probe: ReturnType<typeof vi.fn>; download: ReturnType<typeof vi.fn> };
    browserProbe: { discover: ReturnType<typeof vi.fn> };
    storage: {
      tmpDir: ReturnType<typeof vi.fn>;
      discardTemp: ReturnType<typeof vi.fn>;
      commitTemp: ReturnType<typeof vi.fn>;
    };
    nodes: Record<string, ReturnType<typeof vi.fn>>;
    media: { ensureThumbnail: ReturnType<typeof vi.fn> };
    downloads: Record<string, ReturnType<typeof vi.fn>>;
    config: {
      downloadMaxBytes: number;
      downloadMaxDurationMs: number;
      downloadExamineTimeoutMs: number;
      downloadAllowPrivateAddresses: boolean;
    };
    log: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ftdrive-pipeline-test-'));
    deps = {
      extractor: {
        probe: vi.fn(async () => okProbe),
        download: vi.fn(),
      },
      browserProbe: { discover: vi.fn(async () => ({ discoveredUrls: [] })) },
      storage: {
        tmpDir: vi.fn(() => tmpDir),
        discardTemp: vi.fn(async () => {}),
        commitTemp: vi.fn(async () => ({ storagePath: 'ab/cd/blob' })),
      },
      nodes: {
        ensureRootNode: vi.fn(() => ({ id: 'root' })),
        listChildren: vi.fn(() => ({ items: [], nextCursor: null })),
        insertFolderNode: vi.fn(() => ({ id: 'downloads-folder' })),
        resolveOwnedFolderOrThrow404: vi.fn(() => ({ id: 'chosen-folder' })),
        resolveAvailableName: vi.fn((_o: string, _p: string, desired: string) => desired),
        insertFileNode: vi.fn(() => ({ id: 'node-1', thumbStatus: 'pending' })),
        setThumbStatus: vi.fn(),
      },
      media: { ensureThumbnail: vi.fn(async () => 'ready') },
      downloads: {
        markDownloading: vi.fn(),
        setProgress: vi.fn(),
        markCompleted: vi.fn(),
        markFailed: vi.fn(),
      },
      config: {
        downloadMaxBytes: 10_000,
        downloadMaxDurationMs: 60_000,
        downloadExamineTimeoutMs: 5_000,
        downloadAllowPrivateAddresses: false,
      },
      log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildPipeline(): DownloadPipeline {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new DownloadPipeline(deps as any);
  }

  it('creates a node only after a simulated full success', async () => {
    deps.extractor.download.mockImplementation((_url: string, _fmt: string, destPath: string, onProgress: (b: number, t: number | null) => void) => {
      writeFileSync(destPath, Buffer.alloc(100, 0x61));
      onProgress(100, 100);
      return { done: Promise.resolve(), abort: vi.fn() };
    });

    const pipeline = buildPipeline();
    await pipeline.run(makeJob(), new AbortController().signal);

    expect(deps.nodes.insertFileNode).toHaveBeenCalledTimes(1);
    expect(deps.downloads.markCompleted).toHaveBeenCalledWith('job-1', 'node-1');
    expect(deps.storage.discardTemp).not.toHaveBeenCalled();
    expect(deps.downloads.markFailed).not.toHaveBeenCalled();
  });

  it('discards the scratch temp and creates no node on a mid-stream failure', async () => {
    let scratchPath = '';
    deps.extractor.download.mockImplementation((_url: string, _fmt: string, destPath: string) => {
      scratchPath = destPath;
      writeFileSync(destPath, Buffer.alloc(10, 0x61)); // partial bytes only
      return { done: Promise.reject(new Error('boom')), abort: vi.fn() };
    });

    const pipeline = buildPipeline();
    await pipeline.run(makeJob(), new AbortController().signal);

    expect(deps.nodes.insertFileNode).not.toHaveBeenCalled();
    expect(deps.storage.discardTemp).toHaveBeenCalledWith(scratchPath);
    expect(deps.downloads.markFailed).toHaveBeenCalledWith('job-1', 'SOURCE_UNAVAILABLE', expect.any(String));
    expect(existsSync(scratchPath)).toBe(true); // the mock never actually deletes it — commitTemp was never called either
    expect(deps.storage.commitTemp).not.toHaveBeenCalled();
  });

  it('discards the scratch temp and creates no node when canceled mid-stream', async () => {
    const controller = new AbortController();
    let abortCalled = false;
    deps.extractor.download.mockImplementation((_url: string, _fmt: string, destPath: string) => {
      writeFileSync(destPath, Buffer.alloc(10, 0x61));
      let rejectFn!: (err: unknown) => void;
      const done = new Promise<void>((_resolve, reject) => (rejectFn = reject));
      return {
        done,
        abort: vi.fn(() => {
          abortCalled = true;
          const err = new Error('aborted');
          err.name = 'AbortError';
          rejectFn(err);
        }),
      };
    });

    const pipeline = buildPipeline();
    const runPromise = pipeline.run(makeJob(), controller.signal);
    controller.abort();
    await runPromise;

    expect(abortCalled).toBe(true);
    expect(deps.nodes.insertFileNode).not.toHaveBeenCalled();
    expect(deps.storage.commitTemp).not.toHaveBeenCalled();
    expect(deps.storage.discardTemp).toHaveBeenCalled();
    // Cancellation is recorded by the service before the worker ever aborts —
    // the pipeline must NOT also call markFailed and clobber that state.
    expect(deps.downloads.markFailed).not.toHaveBeenCalled();
  });

  it('fails pre-flight with SIZE_LIMIT and never invokes the downloader when the estimate exceeds the cap', async () => {
    deps.config.downloadMaxBytes = 50; // smaller than the 100-byte estimate in okProbe
    const pipeline = buildPipeline();
    await pipeline.run(makeJob(), new AbortController().signal);

    expect(deps.extractor.download).not.toHaveBeenCalled();
    expect(deps.downloads.markFailed).toHaveBeenCalledWith('job-1', 'SIZE_LIMIT', expect.any(String));
    expect(deps.nodes.insertFileNode).not.toHaveBeenCalled();
  });

  it('fails with NO_VIDEO_FOUND when the probe (and fallback) find nothing', async () => {
    deps.extractor.probe.mockResolvedValue({ videoFound: false, directFile: false, candidates: [] });
    const pipeline = buildPipeline();
    await pipeline.run(makeJob(), new AbortController().signal);

    expect(deps.downloads.markFailed).toHaveBeenCalledWith('job-1', 'NO_VIDEO_FOUND', expect.any(String));
    expect(deps.extractor.download).not.toHaveBeenCalled();
  });
});
