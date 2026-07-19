#!/usr/bin/env node
// Fake `yt-dlp` used by integration tests in place of the real binary
// (research.md §11 — external tools are faked at the process boundary).
// It implements just the argument contract `extractor.ts` relies on:
//
//   probe:    --dump-single-json --no-warnings <url>
//   download: -f <formatId> -o <destPath> --newline --no-warnings
//             --progress-template download:FTDRIVE_PROGRESS %(progress.downloaded_bytes)s/%(progress.total_bytes,progress.total_bytes_estimate)s
//             <url>
//             (the "download:" prefix is yt-dlp's progress-TYPE selector and is
//             never printed; "FTDRIVE_PROGRESS " is literal, printed output)
//
// The scenario is chosen from the URL's pathname so tests can address any
// fixture behavior with a plain literal-IP URL (no real DNS/network I/O):
//   /ok            a single video, two formats (480p ~1MB, 1080p ~2MB)
//   /multi         a "playlist" page with two video entries
//   /direct.mp4    a direct video file (extractor_key: Generic)
//   /no-video      static extraction finds nothing (exit 1, no DRM/login pattern)
//   /drm           DRM-protected (exit 1, stderr matches a DRM pattern)
//   /inaccessible  login-gated (exit 1, stderr matches a login pattern)
//   /slow          like /ok but the download writes several small, delayed chunks
//   /fail-download probe succeeds; the download exits non-zero partway through
//   /unbounded     probe declares no total size; download just keeps streaming
//
// For /multi, each candidate's two formats have distinct, byte-size-coded ids
// (c1-480p=100_000 bytes, c1-1080p=200_000, c2-480p=300_000, c2-1080p=400_000)
// so a test can tell exactly which candidate+format was actually downloaded by
// checking the resulting file's size.
// Extra scenarios for 008-movie-site-downloads (embed-based movie sites):
//   /geo           region-locked (exit 1, stderr matches a geo pattern) → inaccessible
//   /embed-stream  a resolved embedded stream: probe OK, but the DOWNLOAD succeeds
//                  ONLY when a `--referer` flag is present (simulates a 403 gate),
//                  proving the captured request context is threaded through (R3)
//   /embed-quality one candidate with two size-coded qualities (q-480p / q-1080p)
//   any path containing `fail-download` → the download exits non-zero partway
import { writeFileSync, appendFileSync, openSync, closeSync } from 'node:fs';

const MULTI_FORMAT_SIZES = { 'c1-480p': 100_000, 'c1-1080p': 200_000, 'c2-480p': 300_000, 'c2-1080p': 400_000 };
const QUALITY_SIZES = { 'q-480p': 150_000, 'q-1080p': 250_000 };

const args = process.argv.slice(2);
const url = args[args.length - 1];
const pathname = (() => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
})();

function candidate(id, title, duration, formats) {
  return { id, title, duration, formats };
}

function singleVideoFormats() {
  return [
    { format_id: '480p', height: 480, width: 854, ext: 'mp4', vcodec: 'avc1', filesize: 1_000_000 },
    { format_id: '1080p', height: 1080, width: 1920, ext: 'mp4', vcodec: 'avc1', filesize: 2_000_000 },
  ];
}

if (args.includes('--dump-single-json')) {
  if (pathname.includes('no-video')) {
    process.stderr.write('ERROR: Unsupported URL: nothing found\n');
    process.exit(1);
  }
  if (pathname.includes('drm')) {
    process.stderr.write('ERROR: This video is DRM protected\n');
    process.exit(1);
  }
  if (pathname.includes('inaccessible')) {
    process.stderr.write("ERROR: Private video. Sign in if you've been granted access to this video\n");
    process.exit(1);
  }
  if (pathname.includes('geo')) {
    process.stderr.write('ERROR: This video is not available in your country\n');
    process.exit(1);
  }
  if (pathname.includes('embed-quality')) {
    const out = candidate('eq-1', 'Embedded Movie', 5400, [
      { format_id: 'q-480p', height: 480, ext: 'mp4', vcodec: 'avc1', filesize: QUALITY_SIZES['q-480p'] },
      { format_id: 'q-1080p', height: 1080, ext: 'mp4', vcodec: 'avc1', filesize: QUALITY_SIZES['q-1080p'] },
    ]);
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (pathname.includes('multi')) {
    const formatsFor = (prefix) => [
      { format_id: `${prefix}-480p`, height: 480, ext: 'mp4', vcodec: 'avc1', filesize: MULTI_FORMAT_SIZES[`${prefix}-480p`] },
      { format_id: `${prefix}-1080p`, height: 1080, ext: 'mp4', vcodec: 'avc1', filesize: MULTI_FORMAT_SIZES[`${prefix}-1080p`] },
    ];
    const out = {
      _type: 'playlist',
      entries: [
        candidate('vid-1', 'First video', 10, formatsFor('c1')),
        candidate('vid-2', 'Second video', 20, formatsFor('c2')),
      ],
    };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (pathname.includes('direct')) {
    const out = {
      id: 'direct-1',
      title: 'direct',
      duration: null,
      extractor_key: 'Generic',
      ext: 'mp4',
      formats: [{ format_id: '0', ext: 'mp4', vcodec: 'avc1', filesize: 500_000 }],
    };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (pathname.includes('huge')) {
    const out = candidate('huge-1', 'Huge video', 3600, [
      { format_id: 'huge', height: 2160, ext: 'mp4', vcodec: 'avc1', filesize: 50_000_000_000 },
    ]);
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (pathname.includes('unbounded')) {
    const out = candidate('unbounded-1', 'Unbounded video', null, [
      { format_id: 'stream', ext: 'mp4', vcodec: 'avc1' },
    ]);
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  // /ok, /slow, /fail-download, and any unrecognized path: a normal single video.
  const out = candidate('ok-1', 'Test Video', 5, singleVideoFormats());
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

if (args.includes('-f')) {
  const destPath = args[args.indexOf('-o') + 1];
  const formatId = args[args.indexOf('-f') + 1];

  if (pathname.includes('fail-download')) {
    writeFileSync(destPath, Buffer.alloc(100, 0x61));
    process.stdout.write('FTDRIVE_PROGRESS 100/1000000\n');
    process.stderr.write('ERROR: network error while downloading\n');
    process.exit(1);
  }

  // A protected embedded stream 403s a context-less request; it succeeds only
  // when the captured Referer is threaded through (008 research R3).
  if (pathname.includes('embed-stream')) {
    if (!args.includes('--referer')) {
      process.stderr.write('ERROR: HTTP Error 403: Forbidden\n');
      process.exit(1);
    }
    writeFileSync(destPath, Buffer.alloc(500_000, 0x61));
    process.stdout.write('FTDRIVE_PROGRESS 500000/500000\n');
    process.exit(0);
  }

  if (formatId in QUALITY_SIZES) {
    const size = QUALITY_SIZES[formatId];
    writeFileSync(destPath, Buffer.alloc(size, 0x61));
    process.stdout.write(`FTDRIVE_PROGRESS ${size}/${size}\n`);
    process.exit(0);
  }

  if (formatId in MULTI_FORMAT_SIZES) {
    const size = MULTI_FORMAT_SIZES[formatId];
    writeFileSync(destPath, Buffer.alloc(size, 0x61));
    process.stdout.write(`FTDRIVE_PROGRESS ${size}/${size}\n`);
    process.exit(0);
  }

  const fd = openSync(destPath, 'w');
  closeSync(fd);

  const chunkSize = 100_000;
  const chunks = pathname.includes('slow') ? 20 : pathname.includes('unbounded') ? 1_000_000 : 5;
  const total = pathname.includes('unbounded') ? 'NA' : chunks * chunkSize;
  const delayMs = pathname.includes('slow') || pathname.includes('unbounded') ? 20 : 0;

  let written = 0;
  let i = 0;
  const tick = () => {
    if (i >= chunks) {
      process.exit(0);
      return;
    }
    appendFileSync(destPath, Buffer.alloc(chunkSize, 0x61));
    written += chunkSize;
    i += 1;
    process.stdout.write(`FTDRIVE_PROGRESS ${written}/${total}\n`);
    if (delayMs > 0) setTimeout(tick, delayMs);
    else tick();
  };
  tick();
} else {
  process.stdout.write('fake-yt-dlp 0.0.0\n');
  process.exit(0);
}
