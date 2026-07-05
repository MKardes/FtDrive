import { useState, type FormEvent } from 'react';
import { useCreateDownload, useExamineUrl } from '../features/downloads/hooks';
import { CandidatePicker } from './CandidatePicker';
import { ApiError } from '../api/client';
import type { DetectedVideoCandidate } from '../api/types';

interface Props {
  /** The folder currently being browsed — only used if the user opts into "save here". */
  currentFolderId: string;
  onClose: () => void;
}

type Step =
  | { kind: 'input' }
  | { kind: 'no-video' }
  | {
      kind: 'review';
      directFile: boolean;
      candidates: DetectedVideoCandidate[];
      candidateId: string;
      formatId: string | null;
    };

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 422) return "That page's video can't be downloaded (sign-in required or copy-protected).";
    if (err.status === 503) return 'Downloads are temporarily unavailable on this server.';
    if (err.status === 409) return 'That video is too large, or would exceed your remaining storage.';
    if (err.status === 400) return "That URL isn't allowed.";
    if (err.status === 404) return 'That destination folder is no longer available.';
  }
  return 'Something went wrong. Please try again.';
}

/**
 * "Download from web" dialog (US1 T031, US3 T056): paste a URL → review the
 * detected video(s) (or a direct-file shortcut, FR-004) → confirm the
 * destination → submit. Downloading runs as a background job; this dialog
 * only starts it (see `DownloadsPanel` for progress/cancel/retry).
 */
export function DownloadUrlDialog({ currentFolderId, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'input' });
  const [saveToCurrent, setSaveToCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examine = useExamineUrl();
  const create = useCreateDownload();
  const busy = examine.isPending || create.isPending;

  function submitUrl(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    examine.mutate(trimmed, {
      onSuccess: (result) => {
        if (!result.videoFound) {
          setStep({ kind: 'no-video' });
          return;
        }
        const candidates = result.candidates ?? [];
        const primary = candidates[0];
        setStep({
          kind: 'review',
          directFile: !!result.directFile,
          candidates,
          candidateId: primary?.candidateId ?? '',
          formatId: primary?.formats[0]?.formatId ?? null,
        });
      },
      onError: (e) => setError(messageFor(e)),
    });
  }

  function confirmDownload() {
    if (step.kind !== 'review') return;
    setError(null);
    create.mutate(
      {
        url: url.trim(),
        destinationFolderId: saveToCurrent ? currentFolderId : null,
        formatId: step.directFile ? null : step.formatId,
      },
      { onSuccess: onClose, onError: (e) => setError(messageFor(e)) },
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Download from web</h3>

        {step.kind === 'input' && (
          <form onSubmit={submitUrl}>
            <div className="field">
              <label className="label" htmlFor="download-url">
                Page or video URL
              </label>
              <input
                id="download-url"
                className="input"
                autoFocus
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={busy || url.trim().length === 0}>
                {examine.isPending ? 'Examining…' : 'Examine'}
              </button>
            </div>
          </form>
        )}

        {step.kind === 'no-video' && (
          <>
            <p className="muted">No downloadable video was found at that URL.</p>
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn" onClick={() => setStep({ kind: 'input' })}>
                Try another URL
              </button>
            </div>
          </>
        )}

        {step.kind === 'review' && (
          <>
            {step.directFile ? (
              <p className="muted">This URL points straight at a video file — ready to download.</p>
            ) : (
              <CandidatePicker
                candidates={step.candidates}
                selectedCandidateId={step.candidateId}
                selectedFormatId={step.formatId}
                onSelect={(candidateId, formatId) => setStep({ ...step, candidateId, formatId })}
              />
            )}
            <label className="row-actions" style={{ alignItems: 'center', marginTop: 12 }}>
              <input type="checkbox" checked={saveToCurrent} onChange={(e) => setSaveToCurrent(e.target.checked)} />
              <span>Save to the current folder instead of “Downloads”</span>
            </label>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={confirmDownload} disabled={busy}>
                {create.isPending ? 'Starting…' : 'Download'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
