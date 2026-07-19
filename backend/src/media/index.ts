import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { Storage } from '../storage/index';
import type { NodeRow } from '../db/schema';

const THUMB_MAX = 400;

/**
 * `unavailable` = the tool needed for generation (ffmpeg) is missing right now:
 * a property of the host, not the file. Callers must NOT persist it as
 * `unsupported`, so generation retries once the tool is installed.
 */
export type ThumbResult = 'ready' | 'unsupported' | 'unavailable';

export function isImageMime(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}
export function isVideoMime(mime: string | null): boolean {
  return !!mime && mime.startsWith('video/');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Media layer (T032): image thumbnails via sharp (EXIF-aware) and video posters
 * via the local `ffmpeg` binary. Thumbnails are cached per-user under `thumbs/`
 * and authorized like content. If ffmpeg is absent or a file can't be decoded,
 * generation degrades gracefully to `unsupported` (research §9).
 */
export class MediaService {
  constructor(private readonly storage: Storage) {}

  /** Ensure a cached thumbnail exists for `node`; returns its resulting status. */
  async ensureThumbnail(ownerId: string, node: NodeRow): Promise<ThumbResult> {
    if (node.type !== 'file' || !node.storagePath) return 'unsupported';

    const dest = this.storage.thumbAbsPath(ownerId, node.id);
    if (await fileExists(dest)) return 'ready';

    const src = this.storage.blobAbsPath(ownerId, node.storagePath);
    await mkdir(this.storage.thumbsDir(ownerId), { recursive: true });

    if (isImageMime(node.mimeType)) {
      return this.makeImageThumb(src, dest);
    }
    if (isVideoMime(node.mimeType)) {
      return this.makeVideoPoster(src, dest);
    }
    return 'unsupported';
  }

  thumbPath(ownerId: string, nodeId: string): string {
    return this.storage.thumbAbsPath(ownerId, nodeId);
  }

  private async makeImageThumb(src: string, dest: string): Promise<ThumbResult> {
    try {
      await sharp(src, { failOn: 'none' })
        .rotate() // honor EXIF orientation
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(dest);
      return 'ready';
    } catch {
      return 'unsupported';
    }
  }

  private async makeVideoPoster(src: string, dest: string): Promise<ThumbResult> {
    const res = await runFfmpegPoster(src, dest);
    if (res === 'ok' && (await fileExists(dest))) return 'ready';
    if (res === 'missing') return 'unavailable';
    return 'unsupported';
  }
}

/**
 * Best-effort check that the `ffmpeg` binary is on PATH (video posters need it).
 * Resolves true/false; never throws. Used for an optional startup warning so an
 * operator immediately knows whether video thumbnails will be generated.
 */
export function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    ff.on('error', () => resolve(false));
    ff.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Extract a single poster frame with ffmpeg. `missing` (spawn error, e.g.
 * ENOENT) means ffmpeg itself is absent; `failed` means ffmpeg ran but could
 * not decode the file.
 */
function runFfmpegPoster(src: string, dest: string): Promise<'ok' | 'failed' | 'missing'> {
  return new Promise((resolve) => {
    const ff = spawn(
      'ffmpeg',
      ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', `scale=${THUMB_MAX}:-1`, '-f', 'image2', dest],
      { stdio: 'ignore' },
    );
    ff.on('error', () => resolve('missing')); // ENOENT => ffmpeg not installed
    ff.on('close', (code) => resolve(code === 0 ? 'ok' : 'failed'));
  });
}
