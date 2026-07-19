import { EventEmitter } from 'node:events';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const launchMock = vi.fn();
vi.mock('playwright', () => ({ chromium: { launch: (...args: unknown[]) => launchMock(...args) } }));

const { BrowserProbe } = await import('../../src/modules/downloads/browser-probe');

const ALLOW = { downloadAllowPrivateAddresses: false };

/** A minimal fake Playwright page: emits `response` events, `goto` resolves immediately. */
class FakePage extends EventEmitter {
  goto = vi.fn(async () => {});
}

function makeFakeBrowser(page: FakePage, onNewContext?: (opts: Record<string, unknown>) => void) {
  return {
    newContext: vi.fn(async (opts: Record<string, unknown>) => {
      onNewContext?.(opts);
      return {
        route: vi.fn(async () => {}),
        newPage: vi.fn(async () => page),
      };
    }),
    close: vi.fn(async () => {}),
  };
}

function fakeResponse(url: string, contentType: string) {
  return {
    url: () => url,
    headers: () => ({ 'content-type': contentType }),
    // The request whose response this is — carries the context we capture (R3).
    request: () => ({
      headers: () => ({ referer: 'http://93.184.216.34/player', 'user-agent': 'FakeUA/1.0' }),
    }),
  };
}

const ONE_SOURCE = { timeoutMs: 2000, playbackWaitMs: 300, maxSources: 5 };

/**
 * Browser-probe unit test (gap G3 from analysis — the headless-fallback is the
 * feature's largest attack-surface addition, per research.md §2, and had no
 * dedicated coverage). Playwright's `chromium.launch` is fully mocked: no real
 * browser is launched. Covers: media/manifest responses are captured, the
 * context is sandboxed (no persisted storage state / downloads disabled), and
 * discovered URLs are re-validated through the SSRF guard before being
 * returned.
 */
describe('BrowserProbe', () => {
  let page: FakePage;
  beforeEach(() => {
    page = new FakePage();
    launchMock.mockReset().mockImplementation(async () => makeFakeBrowser(page));
  });

  it('launches headless with no persisted storage state and downloads disabled', async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    const browser = makeFakeBrowser(page, (opts) => (capturedOpts = opts));
    launchMock.mockResolvedValue(browser);

    const probe = new BrowserProbe();
    await probe.discover('http://93.184.216.34/page', ALLOW, ONE_SOURCE);

    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
    expect(capturedOpts).toMatchObject({ acceptDownloads: false });
    expect(capturedOpts?.storageState).toBeUndefined();
  });

  it('captures video and manifest responses by extension or content-type', async () => {
    page.goto.mockImplementation(async () => {
      page.emit('response', fakeResponse('http://93.184.216.34/seg.m3u8', 'text/plain'));
      page.emit('response', fakeResponse('http://93.184.216.34/video.mp4', 'application/octet-stream'));
      page.emit('response', fakeResponse('http://93.184.216.34/api/data.json', 'application/json'));
      page.emit('response', fakeResponse('http://93.184.216.34/stream', 'video/mp4'));
    });

    const probe = new BrowserProbe();
    const result = await probe.discover('http://93.184.216.34/page', ALLOW, ONE_SOURCE);

    const urls = result.sources.map((s) => s.streamUrl);
    expect(urls).toEqual(
      expect.arrayContaining([
        'http://93.184.216.34/seg.m3u8',
        'http://93.184.216.34/video.mp4',
        'http://93.184.216.34/stream',
      ]),
    );
    expect(urls).not.toContain('http://93.184.216.34/api/data.json');
    // Each source carries the captured request context (R3).
    expect(result.sources[0]?.headers).toMatchObject({ referer: 'http://93.184.216.34/player', userAgent: 'FakeUA/1.0' });
  });

  it('drops a discovered URL that fails the SSRF guard', async () => {
    page.goto.mockImplementation(async () => {
      page.emit('response', fakeResponse('http://127.0.0.1/internal.mp4', 'video/mp4'));
      page.emit('response', fakeResponse('http://93.184.216.34/ok.mp4', 'video/mp4'));
    });

    const probe = new BrowserProbe();
    const result = await probe.discover('http://93.184.216.34/page', ALLOW, ONE_SOURCE);

    expect(result.sources.map((s) => s.streamUrl)).toEqual(['http://93.184.216.34/ok.mp4']);
  });

  it('always closes the browser, even if navigation throws', async () => {
    const browser = makeFakeBrowser(page);
    launchMock.mockResolvedValue(browser);
    page.goto.mockRejectedValue(new Error('navigation timed out'));

    const probe = new BrowserProbe();
    const result = await probe.discover('http://93.184.216.34/page', ALLOW, ONE_SOURCE);

    expect(result.sources).toEqual([]);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
