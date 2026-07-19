# Quickstart & Validation: Drive-Style UI Redesign (007)

## Prerequisites

Same as features 001–006 — Node.js 22, dependencies installed:

```bash
cd backend && npm install && npm run dev        # API on :3000
cd frontend && npm install && npm run dev       # SPA on :5173 (LAN-exposed)
```

Seed at least: one owner account, one extra user (with email), a folder tree with images,
videos and other files (200+ items in one folder for SC-008), one open link share and one
direct share.

## Static gates (run first, must pass)

```bash
cd frontend && npm run typecheck && npm test && npm run build
cd e2e && npx playwright test        # full behavior-parity net (FR-006 / SC-002)
```

## Walkthrough (maps to spec success criteria)

### Shell & navigation (US1 → SC-001, SC-003)

1. Sign in on desktop width: left sidebar shows New + My Drive/Shared/Downloads/Trash
   (+ Users as owner) with icons; top bar shows brand, search, avatar menu.
2. Every area is reachable in ≤2 interactions from anywhere (sidebar or avatar menu).
3. "New" opens a menu: New folder / Upload files / Download from web — all three work and
   target the current folder. On Trash/Shared/etc. the New button is visibly disabled.
4. At 360px: sidebar becomes a drawer behind the hamburger; drawer closes after navigating;
   no horizontal scroll on any screen (SC-004).

### Folder view (US2 → SC-003, SC-007, SC-008)

5. A mixed folder shows a "Folders" section of compact tiles and a "Files" section of
   thumbnail cards; non-media files show type icons — zero emoji anywhere (SC-007).
6. Grid/list toggle switches presentation; reload — the choice sticks (SC-006). List view
   shows name + size with the same ⋮ / Download / selection behavior.
7. Breadcrumb from My Drive into a nested folder: ancestors clickable, long names truncate.
8. ⋮ menu on a bottom-row/last-column card stays fully on screen (FR-012).
9. Select mode: check several items, bulk Move and bulk Delete behave exactly as before,
   action bar shows count; partial failures still report per item.
10. 200+-item folder: "Load more" pagination intact, both views stay smooth (SC-008).
11. Drag a file from the OS onto the folder — styled drop overlay appears, upload lands in
    the bottom-right tray with progress/retry/dismiss.

### Consistency pass (US3 → SC-002)

12. Sign out → sign-in page is a branded centered card. Sign in again.
13. Trash / Shared with me / My shares / Downloads / Users: structured rows (icon, text,
    secondary detail, right-aligned actions), styled empty states, consistent dialogs.
    Exercise one action on each screen (restore, open a shared item, copy link + revoke,
    cancel or retry a download, admin reset password).
14. Open a photo → viewer uses icon controls; ArrowLeft/ArrowRight/Escape still work;
    position indicator shows "n of m". Same for a video.
15. Open an open-link share in a private window: branded public page, new styling, preview
    + download work, no signed-in chrome (uniform 404 behavior unchanged).
16. Every dialog closes on Escape; destructive confirmations emphasize the dangerous
    action (FR-011).

### Appearance (US4 → SC-005, SC-006)

17. Fresh profile (or cleared storage): appearance follows the OS preference.
18. Avatar menu → switch Light/Dark: every surface updates instantly, including open
    dialogs and the viewer; reload — the choice sticks (SC-006).
19. Spot-check text contrast in both themes (≥4.5:1 for body/labels — SC-005); keyboard-tab
    across the shell, cards, menus: focus ring visible everywhere (FR-011).

## Acceptance

The feature is done when the static gates pass, the Playwright suite passes, and every
walkthrough step above holds at desktop and 360px widths in both themes.
