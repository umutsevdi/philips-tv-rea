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
let scopeRoot: HTMLElement | null = null;

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
    if (scrollPending) reveal(scrollPending);
    scrollPending = null;
  });
}

/* -- reveal: explicit scrolling, not scrollIntoView ---------------------- */
/* scrollIntoView is unreliable here: this Blink build predates the options
   object (Chrome 61), so {block:'nearest'} degrades to alignToTop, and even
   where supported, 'nearest' only guarantees visibility — scrolling down and
   back up let containers rest flush at their edges, eating the hero's top
   inset (the recurring "hero top gap"). Instead we walk the scrollable
   ancestors and set the offset ourselves:
   - horizontal tracks rest the focused element centered in the padded
     content box (the container's padding is the safe-area inset),
   - vertical scrollers keep the container's own padding visible as the
     resting inset, so the TopBar→hero gap survives every scroll position. */

const SMOOTH =
  typeof document !== 'undefined' && 'scrollBehavior' in document.documentElement.style;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function reveal(el: HTMLElement): void {
  for (
    let node = el.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const cs = getComputedStyle(node);
    const canX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const canY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
    if (!canX && !canY) continue;
    const r = el.getBoundingClientRect();
    const c = node.getBoundingClientRect();
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    let left = node.scrollLeft;
    let top = node.scrollTop;
    if (canX) {
      /* center within the padded box; the clamp does the rest when the
         element sits at either end of the content */
      const room = c.width - padL - padR - r.width;
      const targetLeft = c.left + padL + Math.max(0, room / 2);
      const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      left = clamp(left + (r.left - targetLeft), 0, maxLeft);
    }
    if (canY) {
      const topLimit = c.top + padT;
      const botLimit = c.bottom - padB;
      const maxTop = Math.max(0, node.scrollHeight - node.clientHeight);
      if (r.top < topLimit) top = clamp(top + (r.top - topLimit), 0, maxTop);
      else if (r.bottom > botLimit) top = clamp(top + (r.bottom - botLimit), 0, maxTop);
    }
    if (left !== node.scrollLeft || top !== node.scrollTop) {
      if (SMOOTH) node.scrollTo({ left, top, behavior: 'smooth' });
      else { node.scrollLeft = left; node.scrollTop = top; }
    }
  }
}

/** Navigation scope: while set, move()/focusWithin() only resolve inside
    this subtree. Used for dialogs and for home/apps view switching. */
export function setScope(root: HTMLElement | null): void {
  scopeRoot = root;
}

/** Focus the first element inside a scope subtree (row/col order).
    Skips the utility bar (row -1) so entering a view lands on content. */
export function focusWithin(root: HTMLElement): boolean {
  const list = all()
    .filter((f) => root.contains(f.el))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const first = list.find((f) => f.row >= 0) ?? list[0];
  if (first) { anchorX = null; applyFocus(first); return true; }
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

/** Pointer-mode environments (the TV's Internet browser moves a virtual
    cursor with the D-pad instead of delivering arrow keys): hovering a
    focusable counts as focusing it — without the scroll reveal, which
    would fight the cursor (content moves under a stationary pointer,
    hover refires on the next element, scroll loops). */
export function hoverFocus(el: HTMLElement): void {
  const f = all().find((x) => x.el === el);
  if (!f || f.id === focusedId) return;
  const prev = focusedId ? registry.get(focusedId) : undefined;
  if (prev) {
    prev.el.classList.remove('focused');
    prev.el.classList.remove('pressed');
  }
  focusedId = f.id;
  f.el.classList.add('focused');
  f.el.focus({ preventScroll: true });
  markShelves(f.el);
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

    Vertical moves are row-banded: candidates are clustered into visual
    rows by rect proximity, the nearest band in the pressed direction wins,
    and only then is a column chosen inside it. A single unified score
    would let a far column in the adjacent row lose to a near column two
    rows away — focus would skip the row in between whenever the neighbour
    is narrower than the anchor (sparse, capped rows), which is the
    "skipped row" bug. Within a band, edge distance beats center distance
    so gutters and partially covered columns land sensibly.

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

  interface Cand { f: Focusable; fx: number; fy: number; r: DOMRect }
  const cands: Cand[] = [];
  for (const f of registry.values()) {
    if (f.id === cur.id) continue;
    if (scopeRoot && !scopeRoot.contains(f.el)) continue;
    const r = f.el.getBoundingClientRect();
    const fx = r.left + r.width / 2;
    const fy = r.top + r.height / 2;
    // must actually be in the direction pressed
    if (dir === 'left' && fx >= cx - 4) continue;
    if (dir === 'right' && fx <= cx + 4) continue;
    if (dir === 'up' && fy >= cy - 4) continue;
    if (dir === 'down' && fy <= cy + 4) continue;
    cands.push({ f, fx, fy, r });
  }
  if (!cands.length) return;

  let best: Focusable | null = null;
  if (vertical) {
    /* band = visual row: centers within 48px cluster together (same-row
       cards differ by a few px; distinct rows sit >100px apart) */
    const BAND = 48;
    const sorted = [...cands].sort((a, b) => a.fy - b.fy);
    const bands: Cand[][] = [];
    for (const c of sorted) {
      const last = bands[bands.length - 1];
      if (last && c.fy - last[0].fy <= BAND) last.push(c);
      else bands.push([c]);
    }
    // adjacent band in the pressed direction = smallest vertical distance
    let nearest: Cand[] = bands[0];
    let nearestDist = Infinity;
    for (const b of bands) {
      let d = Infinity;
      for (const c of b) d = Math.min(d, Math.abs(c.fy - cy));
      if (d < nearestDist) { nearestDist = d; nearest = b; }
    }
    // best column inside that band, by distance from the anchor to the
    // element's nearest edge (0 when the anchor is over the element)
    let bestEdge = Infinity;
    for (const c of nearest) {
      const e = colX < c.r.left ? c.r.left - colX
        : colX > c.r.right ? colX - c.r.right : 0;
      if (e < bestEdge) { bestEdge = e; best = c.f; }
    }
  } else {
    // horizontal moves stay unified: primary axis distance, penalize
    // sideways drift heavily
    let bestScore = Infinity;
    for (const c of cands) {
      const primary = Math.abs(c.fx - cx);
      const drift = Math.abs(c.fy - cy);
      const score = primary + drift * 3;
      if (score < bestScore) { bestScore = score; best = c.f; }
    }
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
