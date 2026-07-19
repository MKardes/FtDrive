/**
 * Popover placement (007, research.md D9, FR-012): menus stay sibling
 * popovers (no portal — 005 precedent), so keeping them on screen is a small
 * measurement at open time. Returns which way the menu should open relative
 * to its trigger; callers translate the flags into `--up` / `--left` classes.
 */
export interface MenuPlacement {
  /** Open above the trigger (not enough room below). */
  up: boolean;
  /** Align the menu's left edge to the trigger (default is right-aligned). */
  alignLeft: boolean;
}

const EDGE_MARGIN = 8;

export function measureMenuPlacement(
  trigger: HTMLElement,
  { menuHeight = 240, menuWidth = 200 }: { menuHeight?: number; menuWidth?: number } = {},
): MenuPlacement {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const up = spaceBelow < menuHeight + EDGE_MARGIN && rect.top > spaceBelow;
  const alignLeft = rect.right - menuWidth < EDGE_MARGIN;
  return { up, alignLeft };
}

export function placementClasses(base: string, placement: MenuPlacement): string {
  let cls = base;
  if (placement.up) cls += ` ${base}--up`;
  if (placement.alignLeft) cls += ` ${base}--left`;
  return cls;
}
