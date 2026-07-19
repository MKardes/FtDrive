import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * `yt-dlp` wrapper (research.md §1) — the extraction/download engine. Always
 * spawned with an explicit argument array (never a shell string) so a
 * malicious URL can never inject shell syntax. `probe()` discovers candidates
 * without downloading; `download()` fetches the chosen format, reporting
 * progress via `--newline --progress-template` stdout parsing.
 */

export interface ExtractorFormat {
  formatId: string;
  quality: string | null;
  width: number | null;
  height: number | null;
  ext: string | null;
  estimatedBytes: number | null;
}

export interface ExtractorCandidate {
  candidateId: string;
  title: string | null;
  durationSec: number | null;
  formats: ExtractorFormat[];
}

export interface ProbeResult {
  videoFound: boolean;
  directFile: boolean;
  candidates: ExtractorCandidate[];
}

/**
 * Request context captured from an embedded player (008-movie-site-downloads,
 * research.md R3). Protected movie streams reject a context-less request
 * (typically HTTP 403); passing the originating Referer/Origin/User-Agent (and
 * any cookie the sandbox's own isolated context set for the host) makes the
 * fetch succeed. Threaded into `probe()`/`download()` as discrete argv flags —
 * never a shell string — so a hostile value can't inject.
 */
export interface StreamHeaders {
  referer?: string;
  origin?: string;
  userAgent?: string;
  cookie?: string;
}

/** Build the `yt-dlp` header/UA argv from a captured request context (research R3). */
export function buildContextArgs(context?: StreamHeaders): string[] {
  if (!context) return [];
  const args: string[] = [];
  if (context.userAgent) args.push('--user-agent', context.userAgent);
  if (context.referer) args.push('--referer', context.referer);
  if (context.origin) args.push('--add-header', `Origin:${context.origin}`);
  if (context.cookie) args.push('--add-header', `Cookie:${context.cookie}`);
  return args;
}

/**
 * The content exists but cannot be fetched — reported, never silently skipped
 * (FR-016). {@link DrmProtectedError} is the copy-protected case specifically;
 * {@link SourceInaccessibleError} covers login/paywall/private-video gates.
 */
export class SourceInaccessibleError extends Error {}
export class DrmProtectedError extends SourceInaccessibleError {}

const DRM_PATTERNS = [/drm/i, /widevine/i, /copy.protect/i];
// Login/paywall gates plus geo-blocks (research R9): a region lock is reported
// as inaccessible, not silently treated as "no video." We report geo-blocks —
// we never bypass them (no --geo-bypass), consistent with the DRM stance.
const INACCESSIBLE_PATTERNS = [
  /sign in/i,
  /login required/i,
  /private video/i,
  /members.?only/i,
  /paywall/i,
  /not available in your country/i,
  /geo.?restricted/i,
  /geo.?block/i,
  /not available in your (?:region|location)/i,
];

interface RawFormat {
  format_id?: unknown;
  format_note?: unknown;
  height?: unknown;
  width?: unknown;
  ext?: unknown;
  filesize?: unknown;
  filesize_approx?: unknown;
  vcodec?: unknown;
}

interface RawVideoInfo {
  id?: unknown;
  title?: unknown;
  duration?: unknown;
  ext?: unknown;
  extractor_key?: unknown;
  formats?: unknown;
  _type?: unknown;
  entries?: unknown;
}

function toRawFormats(raw: RawVideoInfo): RawFormat[] {
  if (Array.isArray(raw.formats)) return raw.formats as RawFormat[];
  return [];
}

function formatQualityLabel(f: RawFormat): string | null {
  if (typeof f.format_note === 'string' && f.format_note.length > 0) return f.format_note;
  if (typeof f.height === 'number') return `${f.height}p`;
  return null;
}

function toExtractorFormat(f: RawFormat, index: number): ExtractorFormat {
  return {
    formatId: typeof f.format_id === 'string' ? f.format_id : String(index),
    quality: formatQualityLabel(f),
    width: typeof f.width === 'number' ? f.width : null,
    height: typeof f.height === 'number' ? f.height : null,
    ext: typeof f.ext === 'string' ? f.ext : null,
    estimatedBytes:
      typeof f.filesize === 'number' ? f.filesize : typeof f.filesize_approx === 'number' ? f.filesize_approx : null,
  };
}

/** Video-only or audio-only formats are excluded from candidate display — we want playable, muxed options. */
function isDisplayableFormat(f: RawFormat): boolean {
  return f.vcodec !== 'none';
}

function toCandidate(raw: RawVideoInfo, index: number): ExtractorCandidate {
  const rawFormats = toRawFormats(raw).filter(isDisplayableFormat);
  const formats = rawFormats.length > 0 ? rawFormats.map(toExtractorFormat) : toRawFormats(raw).map(toExtractorFormat);
  return {
    candidateId: typeof raw.id === 'string' ? raw.id : String(index),
    title: typeof raw.title === 'string' ? raw.title : null,
    durationSec: typeof raw.duration === 'number' ? raw.duration : null,
    formats,
  };
}

function isDirectFile(raw: RawVideoInfo): boolean {
  return raw.extractor_key === 'Generic';
}

export function parseProbeJson(stdout: string): ProbeResult {
  const parsed = JSON.parse(stdout) as RawVideoInfo;
  if (parsed._type === 'playlist' && Array.isArray(parsed.entries)) {
    const entries = (parsed.entries as RawVideoInfo[]).filter((e) => e && typeof e === 'object');
    const candidates = entries.map((e, i) => toCandidate(e, i));
    return { videoFound: candidates.length > 0, directFile: false, candidates };
  }
  const candidate = toCandidate(parsed, 0);
  return { videoFound: true, directFile: isDirectFile(parsed), candidates: [candidate] };
}

function classifyFailure(stderr: string): 'drm' | 'inaccessible' | 'no-video' {
  if (DRM_PATTERNS.some((p) => p.test(stderr))) return 'drm';
  if (INACCESSIBLE_PATTERNS.some((p) => p.test(stderr))) return 'inaccessible';
  return 'no-video';
}

export function buildProbeArgs(url: string, context?: StreamHeaders): string[] {
  return ['--dump-single-json', '--no-warnings', ...buildContextArgs(context), url];
}

/** Literal text (part of the progress-template's rendered value) that marks our progress lines. */
const PROGRESS_MARKER = 'FTDRIVE_PROGRESS';

export function buildDownloadArgs(
  url: string,
  formatId: string | null,
  destPath: string,
  context?: StreamHeaders,
): string[] {
  return [
    '-f',
    formatId ?? 'best',
    '-o',
    destPath,
    '--newline',
    '--no-warnings',
    ...buildContextArgs(context),
    '--progress-template',
    // NOTE: the leading "download:" is yt-dlp's progress-TYPE selector — it is
    // consumed by yt-dlp and never printed. `PROGRESS_MARKER` is the actual
    // literal text (part of the template value) that lets us recognize our
    // line among yt-dlp's other stdout chatter.
    `download:${PROGRESS_MARKER} %(progress.downloaded_bytes)s/%(progress.total_bytes,progress.total_bytes_estimate)s`,
    url,
  ];
}

const PROGRESS_LINE = new RegExp(`^${PROGRESS_MARKER} (\\d+)/(\\d+|NA)$`);

export function parseProgressLine(line: string): { bytesDownloaded: number; totalBytes: number | null } | null {
  const m = PROGRESS_LINE.exec(line.trim());
  if (!m) return null;
  const bytesDownloaded = Number.parseInt(m[1] as string, 10);
  const totalBytes = m[2] === 'NA' ? null : Number.parseInt(m[2] as string, 10);
  return { bytesDownloaded, totalBytes };
}

export interface DownloadHandle {
  /** Resolves when the download completes successfully. */
  done: Promise<void>;
  /** Abort the in-flight download (cancel, FR-008). */
  abort: () => void;
}

export class Extractor {
  constructor(private readonly ytDlpPath: string) {}

  /** Best-effort health check; never throws. Used for DOWNLOADS_ENABLED degradation. */
  isAvailable(): Promise<boolean> {
    return new Promise((resolvePromise) => {
      const child = spawn(this.ytDlpPath, ['--version'], { stdio: 'ignore' });
      child.on('error', () => resolvePromise(false));
      child.on('close', (code) => resolvePromise(code === 0));
    });
  }

  probe(
    url: string,
    opts: { signal?: AbortSignal; timeoutMs?: number; context?: StreamHeaders } = {},
  ): Promise<ProbeResult> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(this.ytDlpPath, buildProbeArgs(url, opts.context), { stdio: ['ignore', 'pipe', 'pipe'], signal: opts.signal });
      let stdout = '';
      let stderr = '';
      const timer = opts.timeoutMs
        ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs)
        : undefined;

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (code === 0 && stdout.trim().length > 0) {
          try {
            resolvePromise(parseProbeJson(stdout));
          } catch {
            resolvePromise({ videoFound: false, directFile: false, candidates: [] });
          }
          return;
        }
        const failure = classifyFailure(stderr);
        if (failure === 'drm') {
          reject(new DrmProtectedError('This content is copy-protected and cannot be downloaded'));
          return;
        }
        if (failure === 'inaccessible') {
          reject(new SourceInaccessibleError('This content is not accessible (login or access required)'));
          return;
        }
        resolvePromise({ videoFound: false, directFile: false, candidates: [] });
      });
    });
  }

  /**
   * Download the chosen format to `destPath`. Progress (bytes/total, total may
   * be null when unknown) is reported via `onProgress`. Aborting kills the
   * child process; the caller (pipeline) is responsible for discarding any
   * partial file (FR-010).
   */
  download(
    url: string,
    formatId: string | null,
    destPath: string,
    onProgress: (bytesDownloaded: number, totalBytes: number | null) => void,
    context?: StreamHeaders,
  ): DownloadHandle {
    const controller = new AbortController();
    const child = spawn(this.ytDlpPath, buildDownloadArgs(url, formatId, destPath, context), {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: controller.signal,
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));

    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      const progress = parseProgressLine(line);
      if (progress) onProgress(progress.bytesDownloaded, progress.totalBytes);
    });

    const done = new Promise<void>((resolvePromise, reject) => {
      child.on('error', (err) => reject(err));
      child.on('close', (code, signal) => {
        rl.close();
        if (code === 0) {
          resolvePromise();
        } else if (signal || controller.signal.aborted) {
          const err = new Error('Download aborted');
          err.name = 'AbortError';
          reject(err);
        } else {
          reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }
      });
    });

    return { done, abort: () => controller.abort() };
  }
}
