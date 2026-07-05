import type { DetectedVideoCandidate } from '../api/types';

interface Props {
  candidates: DetectedVideoCandidate[];
  selectedCandidateId: string;
  selectedFormatId: string | null;
  onSelect: (candidateId: string, formatId: string | null) => void;
}

function formatSizeLabel(bytes: number | null): string | null {
  if (bytes == null) return null;
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function durationLabel(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Lists every detected video with title/duration and lets the user pick one
 * (and its quality); when nothing is picked, the caller defaults to the
 * primary candidate's best-quality format (US3, T055).
 */
export function CandidatePicker({ candidates, selectedCandidateId, selectedFormatId, onSelect }: Props) {
  return (
    <ul className="list" style={{ maxHeight: '40vh', overflow: 'auto' }}>
      {candidates.map((c) => {
        const duration = durationLabel(c.durationSec);
        return (
          <li key={c.candidateId} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label className="row-actions" style={{ alignItems: 'center' }}>
              <input
                type="radio"
                name="candidate"
                checked={c.candidateId === selectedCandidateId}
                onChange={() => onSelect(c.candidateId, c.formats[0]?.formatId ?? null)}
              />
              <span className="spacer">
                {c.title ?? 'Untitled video'} {duration && <span className="muted">({duration})</span>}
              </span>
            </label>
            {c.candidateId === selectedCandidateId && c.formats.length > 0 && (
              <select
                className="input"
                aria-label="Quality"
                value={selectedFormatId ?? ''}
                onChange={(e) => onSelect(c.candidateId, e.target.value)}
                style={{ marginTop: 8 }}
              >
                {c.formats.map((f) => {
                  const size = formatSizeLabel(f.estimatedBytes);
                  return (
                    <option key={f.formatId} value={f.formatId}>
                      {[f.quality ?? f.formatId, f.ext, size].filter(Boolean).join(' · ')}
                    </option>
                  );
                })}
              </select>
            )}
          </li>
        );
      })}
    </ul>
  );
}
