/* Spatial navigation engine. The performance-critical piece (docs/08):
   a flat registry of focusable elements, nearest-in-direction resolution,
   scrollIntoView, and focus persistence. No framework reactivity on the
   hot path — direct DOM class toggling.

   Focus visuals are class-driven (.focused/.pressed), never native :focus,
   so engine state and rendered state can't disagree (skill §5). */

export interface Focusable {
  id: string;               // stable, e.g. 'row:0:tile:2'
  el: HTMLElement;
  row: number;
  col: number;              // order within row; -1 = not resolved yet
}

const registry = new Map<string, Focusable>();
let focusedId: string | null = null;
const BACK_STACK_KEY = 'launcher.backstack';
const LAST_FOCUS_KEY = 'launcher.lastfocus';
let backStack: string[] = loadStack();
let anchorX: number | null = null;   // column memory across vertical moves
let modalRoot: HTMLElement | null = null;

function loadStack(): string[] {
  try { return JSON.parse(localStorage.getItem(BACK_STACK_KEY) ?? '[]'); } catch { return []; }
}

function saveStack(): void {
  try { localStorage.setItem(BACK_STACK_KEY, JSON.stringify(backStack.slice(-32))); } catch { /* full */ }
}

export function register(f: Focusable): void {
  registry.set(f.id, f);
}

export function unregister(id: string): void {
  registry.delete(id);
}

export function get(id: string): Focusable | undefined {
  return registry.get(id);
}

export function all(): Focusable[] {
  return [...registry.values()];
}

/** Depth system: mark the shelf holding focus, dim its siblings. */
function markShelves(el: HTMLElement): void {
  const shelf = el.closest('.shelf');
  const shelves = document.querySelectorAll<HTMLElement>('.shelf');
  for (const s of shelves) {
    s.classList.toggle('dimmed', !!shelf && s !== shelf);
  }
}

function applyFocus(f: Focusable): void {
  const prev = focusedId ? registry.get(focusedId) : undefined;
  if (prev) {
    prev.el.classList.remove('focused');
    prev.el.classList.remove('pressed');
  }
  focusedId = f.id;
  f.el.classList.add('focused');
  f.el.focus({ preventScroll: true });
  markShelves(f.el);
  scrollIntoViewThrottled(f.el);
  try { localStorage.setItem(LAST_FOCUS_KEY, f.id); } catch { /* full */ }
}

let scrollPending: HTMLElement | null = null;
let scrollScheduled = false;

function scrollIntoViewThrottled(el: HTMLElement): void {
  scrollPending = el;
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    scrollPending?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
}

/** Modal scoping: while set, move() only resolves inside this subtree. */
export function setModal(root: HTMLElement | null): void {
  modalRoot = root;
}

/** Focus the first element inside a modal subtree (row/col order). */
export function focusWithin(root: HTMLElement): boolean {
  const list = all()
    .filter((f) => root.contains(f.el))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  if (list[0]) { anchorX = null; applyFocus(list[0]); return true; }
  return false;
}

/** Pressed state, driven by the App's keydown/keyup. */
export function press(): void {
  focused()?.el.classList.add('pressed');
}

export function release(): void {
  const f = focused();
  if (f) f.el.classList.remove('pressed');
}

export function focus(id: string, pushStack = true): void {
  const f = registry.get(id);
  if (!f) return;
  if (pushStack && focusedId && focusedId !== id) {
    backStack.push(focusedId);
    saveStack();
  }
  anchorX = null;
  applyFocus(f);
}

export function focused(): Focusable | undefined {
  return focusedId ? registry.get(focusedId) : undefined;
}

/** Move focus to the nearest focusable in `dir`.

    Vertical moves keep a column anchor: the x you departed from persists
    across consecutive up/down moves, so drift never accumulates between
    rows of different widths (skill §6 focus memory). Horizontal moves
    re-anchor on the next vertical departure. */
export function move(dir: 'up' | 'down' | 'left' | 'right'): void {
  const cur = focused();
  if (!cur) { focusFirst(); return; }
  const from = cur.el.getBoundingClientRect();
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;

  const vertical = dir === 'up' || dir === 'down';
  if (vertical) {
    if (anchorX === null) anchorX = cx;
  } else {
    anchorX = null; // horizontal intent resets column memory
  }
  const colX = vertical ? (anchorX ?? cx) : cx;

  let best: Focusable | null = null;
  let bestScore = Infinity;
  for (const f of registry.values()) {
    if (f.id === cur.id) continue;
    if (modalRoot && !modalRoot.contains(f.el)) continue;
    const r = f.el.getBoundingClientRect();
    const fx = r.left + r.width / 2;
    const fy = r.top + r.height / 2;
    const dx = fx - cx;
    const dy = fy - cy;
    // must actually be in the direction pressed
    if (dir === 'left' && dx >= -4) continue;
    if (dir === 'right' && dx <= 4) continue;
    if (dir === 'up' && dy >= -4) continue;
    if (dir === 'down' && dy <= 4) continue;
    // primary axis distance, penalize sideways drift heavily
    const primary = vertical ? Math.abs(dy) : Math.abs(dx);
    const drift = vertical ? Math.abs(fx - colX) : Math.abs(dy);
    const score = primary + drift * 3;
    if (score < bestScore) { bestScore = score; best = f; }
  }
  if (best) applyFocus(best);
}

export function focusFirst(): void {
  const list = all().sort((a, b) => a.row - b.row || a.col - b.col);
  // skip the utility bar (row -1): land on content, Up reaches it from there
  const first = list.find((f) => f.row >= 0) ?? list[0];
  if (first) { anchorX = null; applyFocus(first); }
}

/** Back key: pop the focus stack, skipping ids that are no longer mounted;
    returns true when something was restored. */
export function goBack(): boolean {
  while (backStack.length) {
    const prev = backStack.pop()!;
    saveStack();
    if (registry.has(prev)) {
      anchorX = null;
      applyFocus(registry.get(prev)!);
      return true;
    }
  }
  return false;
}

/** Restore last focus from a previous session, if the element exists. */
export function restoreLast(): boolean {
  const id = localStorage.getItem(LAST_FOCUS_KEY);
  if (id && registry.has(id)) {
    anchorX = null;
    applyFocus(registry.get(id)!);
    return true;
  }
  return false;
}

export function reset(): void {
  registry.clear();
  focusedId = null;
  anchorX = null;
}
