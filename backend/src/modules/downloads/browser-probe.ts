/// <reference lib="dom" />
// This module drives a real browser; the `evaluate()` callbacks below run inside
// the page, so they reference DOM globals (document/HTMLVideoElement/…). The DOM
// lib is referenced here only to type-check those in-page callbacks — the Node
// runtime code around them never touches the DOM.
import { chromium } from 'playwright';
import { assertUrlAllowed, type UrlGuardConfig } from '../../lib/url-guard';
import type { StreamHeaders } from './extractor';

/**
 * Headless-fallback discovery (research.md R1/R2, FR-001/FR-002). Used only when
 * static `yt-dlp` probing finds nothing: render the page in a locked-down,
 * isolated, credential-less Chromium context and find the video the way a viewer
 * does. On embed-based movie sites the stream is requested only *after* playback
 * starts inside a third-party player (often a cross-origin iframe), so we:
 *   1. sniff network responses for video/manifest URLs (as before), but now also
 *   2. trigger playback (call `video.play()` in every frame + click the player),
 *   3. capture each stream URL together with the request headers that made it
 *      succeed (Referer/Origin/User-Agent/Cookie — the usual 403 gate), and
 *   4. try the page's alternative embed sources in DOM order, bounded by caps.
 * Every discovered URL is re-validated against the SSRF guard before being
 * returned — this is the feature's largest attack surface, so nothing here is
 * trusted implicitly, and the sandbox never persists credentials or saves files.
 */

export interface ResolvedSource {
  /** The media/manifest URL sniffed after playback started (passed the SSRF guard). */
  streamUrl: string;
  /** Request context needed to fetch the stream (research R3); passed to `yt-dlp`. */
  headers: StreamHeaders;
  /** Best-effort mirror label (the stream host) for diagnostics; never trusted. */
  sourceLabel: string | null;
}

export interface BrowserProbeResult {
  /** Ordered, de-duplicated resolved sources — the site's alternative mirrors (research R4). */
  sources: ResolvedSource[];
}

export interface BrowserDiscoverOptions {
  /** Overall wall-clock budget for the whole discovery (the examine timeout). */
  timeoutMs: number;
  /** How long to wait for a media request after triggering playback, per source. */
  playbackWaitMs: number;
  /** Cap on how many alternative sources to discover/return. */
  maxSources: number;
}

/** Injection point so tests can fake the headless browser (research.md §11). */
export interface BrowserProbeLike {
  discover(url: string, config: UrlGuardConfig, options: BrowserDiscoverOptions): Promise<BrowserProbeResult>;
}

const MEDIA_EXTENSION_PATTERN = /\.(m3u8|mpd|mp4|webm|mov|m4v)(\?|$)/i;
const MEDIA_CONTENT_TYPES = [
  'video/',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml',
];
const QUIESCE_MS = 200;

function isMediaResponse(url: string, contentType: string): boolean {
  return (
    MEDIA_EXTENSION_PATTERN.test(url) ||
    MEDIA_CONTENT_TYPES.some((t) => contentType.toLowerCase().startsWith(t))
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Pull the request context off a sniffed media response (guarded — a mock may omit `request`). */
function extractHeaders(response: unknown): StreamHeaders {
  let raw: Record<string, string> = {};
  try {
    const req = (response as { request?: () => { headers?: () => Record<string, string> } }).request?.();
    raw = req?.headers?.() ?? {};
  } catch {
    raw = {};
  }
  const headers: StreamHeaders = {};
  if (raw['referer']) headers.referer = raw['referer'];
  if (raw['origin']) headers.origin = raw['origin'];
  if (raw['user-agent']) headers.userAgent = raw['user-agent'];
  if (raw['cookie']) headers.cookie = raw['cookie'];
  return headers;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Best-effort: start playback so the player requests its stream. Never throws. */
async function triggerPlayback(page: unknown): Promise<void> {
  const p = page as {
    frames?: () => Array<{ evaluate?: (fn: () => void) => Promise<unknown> }>;
    mouse?: { click?: (x: number, y: number) => Promise<void> };
  };
  try {
    const frames = typeof p.frames === 'function' ? p.frames() : [];
    for (const frame of frames) {
      if (typeof frame.evaluate !== 'function') continue;
      try {
        await frame.evaluate(() => {
          document.querySelectorAll('video').forEach((v) => {
            try {
              (v as HTMLVideoElement).muted = true;
              void (v as HTMLVideoElement).play?.();
            } catch {
              /* autoplay blocked or detached — ignore */
            }
          });
          const btn = document.querySelector(
            '.play, .vjs-big-play-button, .jw-icon-display, button[aria-label*="play" i]',
          ) as HTMLElement | null;
          btn?.click?.();
        });
      } catch {
        /* cross-origin frame can't be scripted — the coordinate click below still reaches it */
      }
    }
    if (p.mouse && typeof p.mouse.click === 'function') {
      try {
        await p.mouse.click(640, 400);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* best-effort only */
  }
}

export class BrowserProbe implements BrowserProbeLike {
  async discover(
    url: string,
    config: UrlGuardConfig,
    options: BrowserDiscoverOptions,
  ): Promise<BrowserProbeResult> {
    const { timeoutMs, playbackWaitMs, maxSources } = options;
    const browser = await chromium.launch({ headless: true });
    const overallDeadline = Date.now() + timeoutMs;
    const found = new Map<string, ResolvedSource>();
    let lastFoundAt = 0;

    const attachSniffer = (page: { on: (evt: string, cb: (response: unknown) => void) => void }) => {
      page.on('response', (response: unknown) => {
        try {
          if (found.size >= maxSources) return;
          const r = response as { url: () => string; headers: () => Record<string, string> };
          const responseUrl = r.url();
          const contentType = r.headers()['content-type'] ?? '';
          if (isMediaResponse(responseUrl, contentType) && !found.has(responseUrl)) {
            found.set(responseUrl, {
              streamUrl: responseUrl,
              headers: extractHeaders(response),
              sourceLabel: hostOf(responseUrl),
            });
            lastFoundAt = Date.now();
          }
        } catch {
          /* a malformed response object — skip it */
        }
      });
    };

    const remainingTimeout = () => Math.max(1000, overallDeadline - Date.now());

    // Wait for media to appear after playback: stop early once results go quiet,
    // the cap is hit, or navigation failed with nothing found; hard-stop at the budget.
    const waitForMedia = async (navOk: boolean): Promise<void> => {
      const cap = Math.min(overallDeadline, Date.now() + playbackWaitMs);
      for (;;) {
        if (found.size >= maxSources) return;
        if (!navOk && found.size === 0) return;
        if (found.size > 0 && Date.now() - lastFoundAt > QUIESCE_MS) return;
        if (Date.now() >= cap) return;
        await sleep(50);
      }
    };

    try {
      const context = await browser.newContext({
        acceptDownloads: false,
        javaScriptEnabled: true,
        viewport: { width: 1280, height: 800 },
      });
      // Never let the sandboxed page actually save anything to disk.
      await context.route('**/*', (route) => route.continue());

      const page = await context.newPage();
      attachSniffer(page as never);

      let navOk = true;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: remainingTimeout() });
      } catch {
        navOk = false; // timed out or failed mid-load — use whatever we discovered
      }
      await triggerPlayback(page);
      await waitForMedia(navOk);

      // Secondary pass: the page's alternative embed sources (research R4). Each is
      // loaded standalone with the movie page as Referer, then played + sniffed.
      // Guarded so the unit-test's minimal fake page (no `evaluate`) skips it.
      const pageEval = (page as { evaluate?: (fn: () => string[]) => Promise<string[]> }).evaluate;
      if (found.size < maxSources && Date.now() < overallDeadline && typeof pageEval === 'function') {
        let embeds: string[] = [];
        try {
          embeds = await pageEval.call(page, () =>
            Array.from(document.querySelectorAll('iframe'))
              .map((f) => (f as HTMLIFrameElement).src)
              .filter((s): s is string => typeof s === 'string' && /^https?:\/\//.test(s)),
          );
        } catch {
          embeds = [];
        }
        for (const embedUrl of [...new Set(embeds)]) {
          if (found.size >= maxSources || Date.now() >= overallDeadline) break;
          try {
            await assertUrlAllowed(embedUrl, config);
          } catch {
            continue; // embed host failed the SSRF guard — skip it
          }
          let sub: Awaited<ReturnType<typeof context.newPage>> | undefined;
          try {
            sub = await context.newPage();
            attachSniffer(sub as never);
            try {
              await sub.goto(embedUrl, {
                referer: url,
                waitUntil: 'networkidle',
                timeout: remainingTimeout(),
              });
            } catch {
              /* keep whatever loaded */
            }
            await triggerPlayback(sub);
            await waitForMedia(true);
          } finally {
            try {
              await sub?.close();
            } catch {
              /* ignore */
            }
          }
        }
      }

      // Re-validate every discovered stream against the SSRF guard before returning.
      const sources: ResolvedSource[] = [];
      for (const source of found.values()) {
        if (sources.length >= maxSources) break;
        try {
          await assertUrlAllowed(source.streamUrl, config);
          sources.push(source);
        } catch {
          // Failed the SSRF guard — drop silently, no internal detail leaked.
        }
      }
      return { sources };
    } finally {
      await browser.close();
    }
  }
}
