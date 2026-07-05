import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const {
  Extractor,
  buildProbeArgs,
  buildDownloadArgs,
  parseProbeJson,
  parseProgressLine,
  DrmProtectedError,
  SourceInaccessibleError,
} = await import('../../src/modules/downloads/extractor');

/** A minimal fake ChildProcess good enough to drive the extractor's event listeners. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

/**
 * Extractor unit tests (T010) — spawn is mocked so nothing real-world (no
 * actual `yt-dlp`) is ever invoked; only argument construction, JSON/progress
 * parsing, and exit-code/stderr classification are under test.
 */
describe('extractor: argument construction', () => {
  it('builds probe args as a flat array (never a shell string)', () => {
    expect(buildProbeArgs('https://example.com/watch?v=1')).toEqual([
      '--dump-single-json',
      '--no-warnings',
      'https://example.com/watch?v=1',
    ]);
  });

  it('builds download args with the format, destination, and progress template', () => {
    const args = buildDownloadArgs('https://example.com/v', '1080p', '/tmp/x.part');
    expect(args).toContain('-f');
    expect(args).toContain('1080p');
    expect(args).toContain('-o');
    expect(args).toContain('/tmp/x.part');
    expect(args[args.length - 1]).toBe('https://example.com/v');
  });

  it('falls back to "best" when no formatId is given', () => {
    const args = buildDownloadArgs('https://example.com/v', null, '/tmp/x.part');
    expect(args[args.indexOf('-f') + 1]).toBe('best');
  });
});

describe('extractor: JSON parsing', () => {
  it('parses a single-video probe result', () => {
    const json = JSON.stringify({
      id: 'v1',
      title: 'A video',
      duration: 42,
      formats: [{ format_id: '720p', height: 720, ext: 'mp4', vcodec: 'avc1', filesize: 123 }],
    });
    const result = parseProbeJson(json);
    expect(result.videoFound).toBe(true);
    expect(result.directFile).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      candidateId: 'v1',
      title: 'A video',
      durationSec: 42,
    });
    expect(result.candidates[0]?.formats[0]).toEqual({
      formatId: '720p',
      quality: '720p',
      width: null,
      height: 720,
      ext: 'mp4',
      estimatedBytes: 123,
    });
  });

  it('parses a playlist (multi-candidate) probe result', () => {
    const json = JSON.stringify({
      _type: 'playlist',
      entries: [
        { id: 'a', title: 'A', duration: 1, formats: [{ format_id: 'f1', vcodec: 'avc1' }] },
        { id: 'b', title: 'B', duration: 2, formats: [{ format_id: 'f2', vcodec: 'avc1' }] },
      ],
    });
    const result = parseProbeJson(json);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.candidateId)).toEqual(['a', 'b']);
  });

  it('flags a Generic-extractor result as a direct file', () => {
    const json = JSON.stringify({ id: 'd', extractor_key: 'Generic', formats: [{ format_id: '0', vcodec: 'avc1' }] });
    const result = parseProbeJson(json);
    expect(result.directFile).toBe(true);
  });
});

describe('extractor: progress line parsing', () => {
  it('parses a known-total progress line', () => {
    expect(parseProgressLine('FTDRIVE_PROGRESS 1000/2000')).toEqual({ bytesDownloaded: 1000, totalBytes: 2000 });
  });
  it('parses an unknown-total progress line', () => {
    expect(parseProgressLine('FTDRIVE_PROGRESS 1000/NA')).toEqual({ bytesDownloaded: 1000, totalBytes: null });
  });
  it('returns null for a non-matching line', () => {
    expect(parseProgressLine('[download] some other yt-dlp chatter')).toBeNull();
  });
});

describe('Extractor.probe (spawn mocked)', () => {
  let child: FakeChild;
  beforeEach(() => {
    child = new FakeChild();
    spawnMock.mockReset().mockReturnValue(child);
  });

  it('resolves candidates on a clean exit', async () => {
    const extractor = new Extractor('yt-dlp');
    const promise = extractor.probe('https://example.com/v');
    child.stdout.emit('data', Buffer.from(JSON.stringify({ id: 'x', formats: [{ format_id: '1', vcodec: 'avc1' }] })));
    child.emit('close', 0);
    const result = await promise;
    expect(result.videoFound).toBe(true);
  });

  it('resolves videoFound=false on a generic non-zero exit', async () => {
    const extractor = new Extractor('yt-dlp');
    const promise = extractor.probe('https://example.com/v');
    child.stderr.emit('data', Buffer.from('ERROR: Unsupported URL\n'));
    child.emit('close', 1);
    const result = await promise;
    expect(result.videoFound).toBe(false);
  });

  it('rejects with DrmProtectedError when stderr matches a DRM pattern', async () => {
    const extractor = new Extractor('yt-dlp');
    const promise = extractor.probe('https://example.com/v');
    child.stderr.emit('data', Buffer.from('ERROR: This video is DRM protected\n'));
    child.emit('close', 1);
    await expect(promise).rejects.toBeInstanceOf(DrmProtectedError);
  });

  it('rejects with SourceInaccessibleError when stderr matches a login-gate pattern', async () => {
    const extractor = new Extractor('yt-dlp');
    const promise = extractor.probe('https://example.com/v');
    child.stderr.emit('data', Buffer.from('ERROR: Private video. Sign in to continue\n'));
    child.emit('close', 1);
    await expect(promise).rejects.toBeInstanceOf(SourceInaccessibleError);
  });
});

describe('Extractor.download (spawn mocked)', () => {
  let child: FakeChild;
  beforeEach(() => {
    child = new FakeChild();
    spawnMock.mockReset().mockReturnValue(child);
  });

  it('reports progress and resolves on a clean exit', async () => {
    const extractor = new Extractor('yt-dlp');
    const seen: Array<[number, number | null]> = [];
    const handle = extractor.download('https://example.com/v', '1080p', '/tmp/out.part', (b, t) => seen.push([b, t]));
    child.stdout.emit('data', Buffer.from('FTDRIVE_PROGRESS 100/1000\n'));
    child.stdout.emit('data', Buffer.from('FTDRIVE_PROGRESS 1000/1000\n'));
    child.emit('close', 0, null);
    await handle.done;
    expect(seen).toEqual([
      [100, 1000],
      [1000, 1000],
    ]);
  });

  it('rejects on a non-zero exit with the stderr message', async () => {
    const extractor = new Extractor('yt-dlp');
    const handle = extractor.download('https://example.com/v', '1080p', '/tmp/out.part', () => {});
    child.stderr.emit('data', Buffer.from('ERROR: network error\n'));
    child.emit('close', 1, null);
    await expect(handle.done).rejects.toThrow('ERROR: network error');
  });

  it('rejects with an AbortError when killed by signal', async () => {
    const extractor = new Extractor('yt-dlp');
    const handle = extractor.download('https://example.com/v', '1080p', '/tmp/out.part', () => {});
    handle.abort();
    child.emit('close', null, 'SIGTERM');
    await expect(handle.done).rejects.toMatchObject({ name: 'AbortError' });
  });
});
