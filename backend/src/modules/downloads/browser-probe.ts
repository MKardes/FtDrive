import { chromium } from 'playwright';
import { assertUrlAllowed, type UrlGuardConfig } from '../../lib/url-guard';

/**
 * Headless-fallback discovery (research.md §2, FR-019). Used only when static
 * `yt-dlp` probing finds nothing: render the page in a locked-down, isolated
 * Chromium context (no stored credentials, downloads disabled, autoplay left
 * to the page but never saved to disk) and sniff network responses for
 * video/manifest URLs. Every discovered URL is re-validated against the SSRF
 * guard before being handed back — this is the feature's largest attack
 * surface, so nothing here is trusted implicitly.
 */

export interface BrowserProbeResult {
  discoveredUrls: string[];
}

/** Injection point so tests can fake the headless browser (research.md §11). */
export interface BrowserProbeLike {
  discover(url: string, config: UrlGuardConfig, timeoutMs: number): Promise<BrowserProbeResult>;
}

const MEDIA_EXTENSION_PATTERN = /\.(m3u8|mpd|mp4|webm|mov|m4v)(\?|$)/i;
const MEDIA_CONTENT_TYPES = [
  'video/',
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml',
];

export class BrowserProbe implements BrowserProbeLike {
  async discover(url: string, config: UrlGuardConfig, timeoutMs: number): Promise<BrowserProbeResult> {
    const browser = await chromium.launch({ headless: true });
    const deadline = Date.now() + timeoutMs;
    try {
      const context = await browser.newContext({
        acceptDownloads: false,
        javaScriptEnabled: true,
        viewport: { width: 1280, height: 800 },
      });
      // Never let the sandboxed page actually save anything to disk.
      await context.route('**/*', (route) => route.continue());

      const page = await context.newPage();
      const discovered = new Set<string>();

      page.on('response', (response) => {
        const responseUrl = response.url();
        const contentType = response.headers()['content-type'] ?? '';
        if (
          MEDIA_EXTENSION_PATTERN.test(responseUrl) ||
          MEDIA_CONTENT_TYPES.some((t) => contentType.toLowerCase().startsWith(t))
        ) {
          discovered.add(responseUrl);
        }
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: Math.max(1000, deadline - Date.now()) });
      } catch {
        // Navigation timed out or failed mid-load — use whatever was discovered so far.
      }

      const validated: string[] = [];
      for (const candidate of discovered) {
        try {
          await assertUrlAllowed(candidate, config);
          validated.push(candidate);
        } catch {
          // Failed the SSRF guard — drop silently, no internal detail leaked.
        }
      }
      return { discoveredUrls: validated };
    } finally {
      await browser.close();
    }
  }
}
