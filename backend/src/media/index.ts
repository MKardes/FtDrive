import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { Storage } from '../storage/index';
import type { NodeRow } from '../db/schema';

const THUMB_MAX = 400;

export type ThumbResult = 'ready' | 'unsupported';

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
    const ok = await runFfmpegPoster(src, dest);
    if (ok && (await fileExists(dest))) return 'ready';
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

/** Extract a single poster frame with ffmpeg. Resolves false if ffmpeg is missing or fails. */
function runFfmpegPoster(src: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn(
      'ffmpeg',
      ['-y', '-ss', '1', '-i', src, '-frames:v', '1', '-vf', `scale=${THUMB_MAX}:-1`, '-f', 'image2', dest],
      { stdio: 'ignore' },
    );
    ff.on('error', () => resolve(false)); // ENOENT => ffmpeg not installed
    ff.on('close', (code) => resolve(code === 0));
  });
}
