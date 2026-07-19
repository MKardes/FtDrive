/**
 * FtDrive brand: inline-SVG mark + wordmark (007, research.md D13). Original
 * geometry — a folded "drive" folder in the accent palette — deliberately not
 * any third party's logo, and self-hosted like every other asset.
 */
export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="logo">
      <svg
        className="logo__mark"
        viewBox="0 0 24 24"
        width="26"
        height="26"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 3H4.5A2.5 2.5 0 0 0 2 5.5v13A2.5 2.5 0 0 0 4.5 21h15a2.5 2.5 0 0 0 2.5-2.5V8a2.5 2.5 0 0 0-2.5-2.5H12L10 3z"
          fill="var(--accent)"
        />
        <path d="M2 10h20v8.5A2.5 2.5 0 0 1 19.5 21h-15A2.5 2.5 0 0 1 2 18.5V10z" fill="var(--accent-strong)" />
        <circle cx="12" cy="15.5" r="2.6" fill="var(--accent-contrast)" opacity="0.92" />
      </svg>
      {withWordmark && <span className="logo__word">FtDrive</span>}
    </span>
  );
}
