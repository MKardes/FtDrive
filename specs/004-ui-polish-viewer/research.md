# Phase 0 Research: UI Layout Polish & Viewer Enhancement

No `[NEEDS CLARIFICATION]` markers remained in the spec or plan's Technical Context. This phase
instead records root-cause findings from reproducing each reported defect against the running
dev app (not assumed from the bug report alone), and the decisions that follow from them.

## Finding: the file-grid overlap is a button fit-content sizing bug, not a grid config problem

- **Reproduction**: opened a real folder containing 3 downloaded videos with long/unbroken
  names. Measured via DOM `getBoundingClientRect()`: the grid's own tracks are correctly sized
  (`grid-template-columns` resolved to seven `157.14px` tracks; each `.file-card-wrapper` grid
  item measured exactly `157.14px` wide). But the `<button class="file-card">` inside two of the
  three wrappers measured `783px` and `439px` wide — 5x and 2.8x its own wrapper — visibly
  overlapping the neighboring cards' thumbnails and Rename/Move/Delete/Download buttons.
- **Root cause**: `.file-card` (`frontend/src/styles/global.css`) sets `display: flex;
  flex-direction: column;` and `overflow: hidden;` but never sets a `width`. A `<button>` is not
  a block-level element by default, so it does not automatically stretch to its containing
  block's width the way a `<div>` would; instead it sizes itself via fit-content, and because
  its own containing wrapper (`.file-card-wrapper`) also has no CSS at all (default
  `display:block`, `min-width:auto`), the button's fit-content calculation can resolve larger
  than the grid track once a long, non-wrapping filename (`.file-card__name` is
  `white-space:nowrap`) is part of its intrinsic content chain.
- **Verified fix**: added `width: 100%; min-width: 0;` to `.file-card` and `min-width: 0;` to
  `.file-card-wrapper` via a live style injection against the same broken folder — all three
  cards immediately measured the correct, identical `157.14px` width with clean ellipsis
  truncation and zero overlap (confirmed by screenshot). This is the fix to carry into
  `global.css`; no JavaScript or markup change is needed.
- **Alternatives considered**: switching `.file-card` to a `<div>` with an inner clickable
  overlay — rejected, changes semantics/accessibility (buttons are keyboard/AT-accessible for
  free) for no benefit once the real cause (missing width) is understood; giving
  `.file-card-wrapper` an explicit fixed width — rejected, duplicates sizing information the
  grid track already establishes and would need to be kept in sync with
  `grid-template-columns` by hand.

## Finding: three components render with zero CSS — not partial styling, literally undefined classes

- **Reproduction**: diffed every `className` referenced in `frontend/src/**/*.tsx` against every
  selector defined in `frontend/src/styles/global.css`. `.file-card-wrapper` (`FileGrid.tsx`),
  `.uploader`, `.upload-list`, `.upload-row`, `.upload-row__name` (all in `Uploader.tsx`) have no
  matching rule anywhere in the stylesheet.
- **Impact observed**: the upload-progress row renders as unstyled inline content — filename,
  status text, and the dismiss button run together with no spacing (confirmed via screenshot:
  `"long-name-file-1.txtDone✕"`), because `.upload-row`'s default `display:block` puts inline
  `<span>`/`<button>` children in ordinary text flow with no gap.
- **Decision**: give these four classes real rules, following the same flex+gap pattern the
  codebase already uses for the analogous `.list-row` (which has an explicit comment: "Wrap
  action buttons onto a second line on narrow (360px) viewports so they never overlap the row
  and stay tappable"). Reuse that established pattern rather than inventing a new one.
- **Additional improvement folded in**: anchor `.upload-list` as a small floating panel
  (`position: absolute`, anchored under the Upload button, `max-height` + scroll) instead of an
  inline flex child of `.toolbar`. Today it occupies flex space in the same row as "New folder" /
  "Download from web", so a long upload list can visually compete with those buttons for space
  on medium-width screens; floating it avoids that without changing toolbar markup structure.
- **Alternatives considered**: leaving `.upload-list` inline but constraining its own width —
  rejected, doesn't address the underlying row-internal spacing bug, which is the one the user
  actually reported.

## Finding: the carousel nav buttons overlap the media itself, confirmed by pixel measurement

- **Reproduction**: opened a photo full-screen on a 360px-wide viewport. Measured: the image
  renders at `x:16, width:345` (nearly edge-to-edge, per the existing `max-width: 96vw` rule);
  the previous-button renders at `x:12, width:40`. The two rectangles overlap by `36×44px` —
  the button sits on top of the photo's left edge, not beside it.
- **Root cause**: `.viewer__nav` is positioned from the *viewport* edge (`left/right: 12px`)
  while `.viewer__content img/video` is sized independently from the viewport too
  (`max-width: 96vw`) — nothing ties the two together, so on any screen where the media is wide
  relative to the viewport, the fixed-position buttons land on top of the media's outer edge
  instead of in the margin beside it.
- **Decision**: reserve a fixed horizontal gutter on both sides of the media, sized to the nav
  control's own footprint plus spacing, by constraining the media's `max-width` to `100vw` minus
  that gutter (e.g. `calc(100vw - <gutter>)`) rather than a plain viewport percentage. This
  guarantees empty space for the buttons to live in regardless of the media's aspect ratio,
  without needing to measure rendered image bounds at runtime.
- **Alternatives considered**: measuring the rendered `<img>`/`<video>` box in JS and positioning
  buttons relative to it — rejected, adds a `ResizeObserver`/layout-effect dependency for a
  problem a CSS constraint solves directly (Simplicity principle); shrinking only the buttons on
  narrow screens instead of reserving a gutter — rejected, doesn't fully eliminate overlap for
  extreme-aspect-ratio media, just makes it less likely.
- **Follow-on effect**: once media is guaranteed to leave a gutter, the top title bar and close
  button — which already cap themselves to fit within that reserved band via existing
  `max-width: 70vw` + ellipsis on `.viewer__bar` — never need a separate fix; they were already
  measured (across every filename length tested, including the longest real filename in the
  drive) to never touch the close button. **Decision**: no change needed to `.viewer__bar`/
  `.viewer__close` positioning itself, only verification via a test case, to avoid touching code
  that isn't actually broken.

## Finding: the viewer backdrop leaks the page behind it

- **Reproduction**: screenshotted the full-screen viewer on a 360px viewport — nav links,
  buttons, and card text from the page behind the viewer are faintly but distractingly visible.
- **Root cause**: `.viewer`'s backdrop is `rgba(0, 0, 0, 0.92)` — 8% of the page behind it always
  shows through.
- **Decision**: raise the backdrop opacity to fully (or near-fully, ≥0.98) opaque so the viewer
  reads as a clean, isolated surface, matching how `.modal-backdrop` elsewhere in the app already
  behaves (`rgba(0,0,0,0.6)` is intentionally translucent there because modals are small dialogs
  meant to show context behind them — the full-screen viewer has the opposite intent).

## Finding: small-resolution media doesn't scale up to use the viewer

- **Reproduction**: opened a 320×176 test video full-screen on a 1280×800 window; it rendered at
  its native 320×176 size, surrounded by a mostly empty black viewport.
- **Root cause**: `.viewer__content img, video` only has `max-width`/`max-height` — ceilings, no
  floor — so anything smaller than those ceilings renders at its native pixel size.
- **Decision**: add a minimum comfortable viewing size (e.g. `min-width: min(480px, <gutter-
  adjusted 100vw>)`), letting the browser's normal replaced-element sizing preserve aspect ratio
  via the existing `height: auto` default, while the current `max-width`/`max-height` still cap
  large media exactly as they do today.
- **Alternatives considered**: computing a JS-driven target size from the media's
  `naturalWidth`/`naturalHeight` or `videoWidth`/`videoHeight` — rejected as unnecessary
  complexity; a CSS-only min/max pair achieves the same user-visible outcome (SC-004) without a
  new measurement/listener dependency.

## Finding: no existing signal for "position in set" to reuse

- **Reproduction**: `PreviewNavProps` (`frontend/src/components/Preview.tsx`) currently carries
  only `onPrev`/`onNext`/`hasPrev`/`hasNext` — booleans, not the actual index or total count.
  `Browse` (`pages/Browse/index.tsx`) already computes `previewIndex` and `items.length` for its
  own carousel-navigation logic (feature 003), so both numbers already exist one level up; they
  just aren't threaded down.
- **Decision**: extend `PreviewNavProps` with `position: { index: number; total: number } |
  undefined` (undefined when not in a multi-item context, e.g. a lone search result), computed
  by `Browse` from data it already has, and rendered as a small "n of total" label in the
  viewer's existing top bar area.
- **Alternatives considered**: having each viewer component independently recompute its position
  — rejected, `Browse` is the only place that already holds the live `items` array and pagination
  state; duplicating that lookup elsewhere would risk drifting from what's actually loaded, the
  same trap feature 003's data-model already called out and avoided.

## Decision: no auto-hide/fade behavior for the title bar

- The spec's Story 4 asks that the title bar not "feel like a permanent obstruction over the
  frame." Once the gutter-reservation fix above lands, the title bar (already confined to the
  reserved top band) never sits over the media at all — so the obstruction concern is resolved
  as a side effect of the overlap fix, without adding idle-timer/mouse-tracking auto-hide logic.
- **Alternatives considered**: fade-out-on-idle via a `mouseleave`/timeout listener — rejected as
  added complexity (timers, cleanup, an extra interaction mode to test) for a problem that a
  layout fix already resolves; revisit only if user feedback after this pass says otherwise.
