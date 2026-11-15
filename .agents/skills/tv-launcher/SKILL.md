---
description: Design and build UI for the Titan OS replacement launcher on a Philips 40PFS6000/62 (Saphi Linux, Vewd/Whale Chromium derivative, Novatek 1.5 GB). Use for any visual, layout, focus, motion, performance or component work in titanos/app — app tiles, shelves, hero, dialogs, navigation, tokens. Encodes 10-foot legibility, 5% safe area, focus-state matrix, D-pad spatial navigation, back-key behaviour and the frame/memory budgets this chipset needs. Not for the desktop GUI in philips_tv/gui.py.
---

# TV launcher design skill

Load this before writing or reviewing any UI in `titanos/app/`. It is
prescriptive: every rule is a number, a token or a yes/no. If a rule and a
habit from web design disagree, the rule wins.

## Device facts & unknowns

**Known — do not re-derive, do not contradict:**

| Fact | Value | Source |
|---|---|---|
| Target set | Philips 40PFS6000/62, TPV-made | `README.md:14` |
| Firmware OS | Saphi Linux, JointSpace 6.1.0 (port 1926) | `README.md:14`, `AGENTS.md:108` |
| OS being replaced | Titan OS launcher SPA, `app.titanos.tv` | `titanos/docs/01-architecture.md:1-10` |
| Browser | "Chromium derivative (Vewd/Whale lineage)" | `titanos/docs/01-architecture.md:8` |
| SoC / RAM | Novatek, 1.5 GB | `titanos/docs/08-recreation-roadmap.md:70` |
| Stock bundle | ~2.3 MB main chunk; our budget 150 KB gzip | `titanos/docs/08-recreation-roadmap.md:71` |
| UA → platform | `TV_NT72690_2025_2K→TPN257E`, `_4K→TPN256E`, `TV_NT72676→TPN258E` | `titanos/docs/02-firmware-api.md:80-82` |
| CSS viewport | `width=1280` | `titanos/app/src/app.html` |
| Build target | `es2019` | `titanos/app/vite.config.ts` |
| Framework | Svelte 5 + SvelteKit (adapter-node) | `titanos/app/package.json` |
| Ad creative size seen | 1920×1080 | `titanos/docs/05-ads-and-tracking.md:49` |
| Keycodes | back `461`/`8`; colours `403–406`; ch `401/402`; HbbTV `112–115` | `titanos/docs/02-firmware-api.md:56-65` |

**Unverified — never assert, probe on device (`titanos/docs/09` pattern):**
Chromium/Blink version; panel resolution (FHD vs HD) and the UI-layer
resolution (720p vs 1080p); CPU clock and GPU; whether `:has()`,
`content-visibility`, `backdrop-filter`, `aspect-ratio`, `gap` in flex,
`scroll-behavior: smooth` and `IntersectionObserver` exist on this build.

Rule: when a feature matters, write it behind a capability check or a
plain-CSS fallback that looks correct without it. Never ship a layout whose
correctness depends on an unverified feature.

**Anti-patterns:** citing Titan's public spec sheet (Chromium 122, 2–3 GB)
as if it described this set; assuming a 4K panel; assuming `backdrop-filter`
works.

## Non-negotiables

1. **One focused element at all times.** Focus is never lost, never null,
   never on a non-actionable element.
2. **Animate `transform` and `opacity` only.** Nothing else, ever, on the
   keypress path.
3. **No blur, no shadow, no filter on a moving or focused element.**
4. **Everything actionable is reachable with D-pad only.** No hover-only,
   no pointer-only, no scroll-only affordance.
5. **Back always retreats exactly one level**, and at the root asks before
   exiting.
6. **Body text ≥ 16 CSS px** at the 1280 viewport (= 24 px at 1080p).
7. **All primary content inside the 5% safe area.**
8. **The keypress path does no layout read, no image decode, no network.**

**Anti-patterns:** `transition: all`; `box-shadow` on `:focus`; a spinner
that blocks focus; `tabindex` as the navigation model; scrollbars.

## 1. Canvas & safe area

- Design in a **1280×720 CSS viewport**; treat 1920×1080 as the same layout
  ×1.5. Never hardcode a physical pixel size.
- **Safe area = 5%**: `64 px` left/right, `36 px` top/bottom at 1280×720
  (`96/54` at 1080p). This matches Google's 5% rule scaled, and sits inside
  Apple's 80/60 at 1080p.
- Backgrounds, artwork and shelf overflow **bleed to the edge**; text,
  focus rings and controls stay inside.
- Reserve the **bottom 240 px** (⅓ of 720) as OSKB territory: never place a
  focusable element there while a text field is active.
- Fixed 16:9. No responsive breakpoints, no portrait, no scrollbars.

**Anti-patterns:** `100vh` layouts that reflow; centring a lone card; a
`max-width` container; padding under 24 px on any edge.

## 2. Grid & shelves

- **12 columns, 24 px gutters, 64 px side margins** at 1280×720. Column
  width = 74 px. Snap every component to this grid.
- Home is **vertical stack of horizontal shelves**. Left/right moves within a
  shelf, up/down moves between shelves. No diagonal-only paths.
- Show a **partial last card** ("peek") so the shelf reads as scrollable.
  Use an **odd visible count** (e.g. 5 or 7) so the last card lands inside
  the safe area.
- Row rhythm: shelf title → 12 px → track. **32 px between shelves.**
  Title baseline sits 8 px above the track's top edge.
- Grids (apps page, catalog) use the same 12 columns; card spans 2 columns
  (172 px) or 3 (270 px). Never mix spans inside one row.
- Focus growth is budgeted: a focused card may grow **≤ 8 px per side**;
  gutters must exceed that (24 px ✓).

**Anti-patterns:** masonry; variable card heights in a row; a shelf that
ends flush at the screen edge; 20+ cards visible at once.

## 3. Typography

Six steps, 1280×720 space. Multiply by 1.5 for 1080p.

| Token | px | Weight | Use |
|---|---|---|---|
| `--fs-caption` | 12 | 500 | timestamps, badges only |
| `--fs-label` | 14 | 500 | tile names, metadata |
| `--fs-body` | 16 | 400 | descriptions, dialog copy |
| `--fs-title` | 20 | 600 | shelf titles, card titles |
| `--fs-headline` | 26 | 600 | hero title, dialog heading |
| `--fs-display` | 36 | 700 | clock, single screen title |

- **Never below 12 px**, and 12 px only for non-essential metadata.
- Weights **≥ 500** for anything read at distance; never `300` or lighter.
- Line height **1.2** for display/headline, **1.4** for body. Max **2 lines**
  of body copy on screen; truncate with ellipsis, never wrap to 3.
- Letter-spacing `-0.01em` on 26 px and above, `0` below.
- One display family + one body family, maximum. System stack fallback is
  acceptable and cheaper than a webfont (see §9).
- Numbers that change (clock, channel) use `font-variant-numeric:
  tabular-nums` so they do not jitter.

**Anti-patterns:** 13 px card names (current `AppTile`); thin weights;
all-caps body; justified text; more than ~12 words per card.

## 4. Color & contrast

- Dark theme only. Base `#10141c`; surfaces `#1a2029`, `#212a35`.
- Text `#e8edf2` on base; secondary `#8a94a6`; tertiary `#5a6472`.
- **Never pure white `#ffffff`** on large areas — cap at `#e8edf2` (≈90%
  luminance) to avoid bloom on cheap panels.
- **One accent** (`#f2a33c` amber) spent only on focus. A second hue
  (`#53d2e1` cyan) only for the live/broadcast state. Nothing else is
  coloured.
- Contrast: body text **≥ 4.5:1**, core UI and focus indicators **≥ 7:1**
  against their actual backdrop. Verify against artwork, not just the base.
- Scrims for text over artwork: flat `rgba(0,0,0,0.55)` gradient, **not**
  `backdrop-filter`.
- Disabled = 40% opacity + no focus ring; it is still never focusable.

**Anti-patterns:** brand colours as backgrounds; gradients as decoration;
pure black `#000` next to pure white; colour-only state signalling.

## 5. Focus system

Focus is the entire interaction model. Build it first.

| State | Scale | Border | Surface | Notes |
|---|---|---|---|---|
| default | 1 | 2 px transparent | `--surface` | |
| focused | 1.04–1.06 | 2 px `--accent` | `--surface-2` | ring is inset-safe |
| pressed | 1.02 | 2 px `--accent` | `--surface-2` | on keydown, revert on keyup |
| selected | 1.04 | 2 px `--accent` | `--accent-soft` | persists after OK |
| disabled | 1 | none | `--surface` @40% | not focusable |

- Scale by component: **1.08** icon-only ≤ 64 px, **1.06** cards/tiles,
  **1.04** hero and anything ≥ 320 px wide.
- Focus must be identifiable **from 3 m**: use **two cues minimum** (scale +
  border, or border + surface change). Never colour alone.
- Ring is `border` on the element, not `outline-offset` that could clip.
  Because `border` changes layout, keep a **2 px transparent border in the
  default state** on every focusable.
- `will-change: transform` **only while focused**; remove on blur.
- Focus change is **synchronous DOM class toggle**; never await a framework
  render to move the ring.

**Anti-patterns:** `outline: none` with no replacement; glow/shadow focus;
animating `border-width`; a focus style that shifts neighbouring cards.

## 6. Navigation & back

- Spatial resolution: **filter by direction → filter by main-axis overlap →
  nearest by primary distance**, penalise drift ×3. This is what
  `src/lib/nav/spatial.ts` implements; keep it.
- **Focus memory per shelf**: returning up/down restores the column you left
  from, not column 0.
- **Back stack**: back pops one level; at root, show a confirm dialog, then
  `window.close()`. Handle `461`, `8` and `Backspace`; never `27`.
- Handle **keydown only**, never both keydown and keyup, or actions double.
- **Key repeat**: apply the move immediately to state; drop repeats that
  arrive while a move is pending; never queue an animation per repeat.
- Long-press (≥ 600 ms) is reserved for one action per surface; do not
  overload it.
- Colour keys map to on-screen hints shown in the current context only.
- Restore last focus on return from an app (`localStorage`), and re-focus the
  triggering element when a dialog closes.

**Anti-patterns:** tab-order navigation; resetting focus to the first item
after an overlay; focus escaping a modal; back that exits without confirm.

## 7. Motion

- Durations: **120 ms** focus in, **160 ms** focus out, **200 ms** maximum
  for any transition. Nothing longer.
- Easing: `cubic-bezier(0.2, 0.7, 0.3, 1)` for focus; linear only for
  progress.
- Only `transform` and `opacity`. No `width`, `height`, `top`, `left`,
  `margin`, `filter`, `box-shadow`, `background-color` transitions on the
  keypress path. `background-color` may transition **only** when the element
  is not moving.
- No animation may gate input: the UI must accept the next keypress before
  the animation finishes.
- Respect `prefers-reduced-motion: reduce` → durations `1 ms`, focus scale
  `1`.

**Anti-patterns:** parallax; spring physics; staggered list reveals; a
slide that plays per key repeat; skeleton shimmer loops.

## 8. Performance

Budgets for this chipset. Treat as hard limits.

- Bundle: **≤ 150 KB gzip total**; named imports only (`import { X } from
  '@lucide/svelte'`, never `import *`).
- Keypress → next paint: **≤ 100 ms**. The handler does: map key → mutate
  focus state → toggle classes. Nothing else. Defer work with
  `setTimeout(…, 0)`.
- Scroll: `scrollIntoView` inside `requestAnimationFrame`, coalesced to one
  pending scroll.
- Visible DOM: **≤ 5 shelves**, **≤ 60 focusable elements** mounted.
  Virtualize any list > 100 items (viewport + 1 screen buffer).
- Compositing layers: **≤ 8**. No `translateZ(0)` on every card; no
  permanent `will-change`.
- Long tasks: chunk at 50 items and yield (`await new Promise(r =>
  setTimeout(r, 0))`). Do not rely on `requestIdleCallback` — Titan's own
  guidance says it stalls on low-end TV browsers; use an interaction-aware
  1.5 s debounce instead.
- No re-render of a large tree on a timer. The clock is its own component.
- Load non-critical modules on interaction, not at boot.

**Anti-patterns:** measuring `getBoundingClientRect()` for every element on
every keypress (cache rects per layout pass); `JSON.parse` of a large payload
on the main thread; analytics at boot; a 7 s synchronous init.

## 9. Assets & memory

- Serve every image at **display size × device pixel ratio**, never a 4K
  original in a 240 px slot. Server-side resize is the only reliable fix.
- Formats: AVIF/WebP with JPEG fallback; SVG for brand marks. No GIF.
- `loading="lazy"` + `decoding="async"`; decode with `img.decode()` before
  attaching when the image is about to be focused.
- Budget: **≤ 40 MB decoded artwork** on screen and buffered; **≤ 12**
  offscreen images retained; drop `src` outside the buffer.
- Layer cost is `w × h × 4` bytes — a full-screen FHD layer is ~8 MB. Count
  them.
- Icons: inline SVG at 24/32/40 px, `stroke-width` 1.5–2. No icon fonts.
- Fonts: prefer the system stack. If a webfont is required, ship **one
  weight pair (400/600), subset, `font-display: swap`**, and preload it.
- Placeholders: flat surface + initial letter or a deterministic muted
  gradient. No blur-up, no LQIP decode.

**Anti-patterns:** `background-image` on hidden elements; animated GIF;
icon font; per-item `<img>` without width/height (layout thrash).

## 10. States

Every surface defines all six before it is "done".

| State | Requirement |
|---|---|
| Loading | Skeleton in the final geometry, ≤ 300 ms before it appears; focus stays on the last valid element. |
| Empty | One line of copy + one actionable focusable. Never a dead end. |
| Error | Plain language, one retry action, focus lands on retry. |
| Offline | Persistent top-bar chip; cached content stays usable. |
| Partial | Render what arrived; never block a whole screen on one failed row. |
| Long-press | Visible hint only while the surface supports it. |

- No full-screen spinner that steals focus.
- Timeouts: show the skeleton at 300 ms, the error at 8 s.

**Anti-patterns:** a modal blocking the home screen while data loads;
"Something went wrong"; retry that is not focusable.

## 11. Accessibility

- Every focusable has an accessible name: `aria-label` on icon-only
  controls, visible text otherwise.
- Add `role` and `aria-live="polite"` for status changes (loading, errors).
- Focus order in the DOM must match visual order; the spatial engine must
  not create a reading order that contradicts it.
- Text magnification: honour a scale factor by multiplying the type tokens,
  not by zooming the viewport.
- Reduced motion: see §7.
- Contrast: see §4. Focus ring ≥ 7:1.
- Do not rely on the platform screen reader being enabled — it is off by
  default on Titan OS; still ship the ARIA.

**Anti-patterns:** `aria-hidden` on focusable content; placeholder as label;
colour-only status.

## 12. Component specs

Sizes are 1280×720 CSS. All focusables carry a 2 px transparent border.

| Component | Size | Type | Notes |
|---|---|---|---|
| `AppTile` | 160×112 (min 152×104) | name `--fs-label` | icon 52 px; name 1 line; radius 12 |
| `Card` | 240 wide, 16:9 art | title `--fs-title` | art first, title below; 1 line |
| `ChannelCard` | 150×90 | number `--fs-headline` | number uses accent; logo ≤ 34 px tall |
| `Hero` | 380×214 | title `--fs-headline` | live edge 4 px cyan; focus ring cyan |
| `Row` | full width | title `--fs-title` | 12 px title→track; 32 px between rows |
| `TopBar` | 56 tall | clock `--fs-display` | clock is its own component |
| `Dialog` | 480–640 wide | heading `--fs-headline` | traps focus; restores on close |

- Tile names currently render at 13 px — bump to 14 px and keep one line.
- Card titles currently 13 px — bump to 20 px per the scale, or drop the
  label and let artwork speak.
- Every component: default/focused/pressed/disabled states defined in the
  component, not inherited from a global `:focus`.

**Anti-patterns:** a component that only looks right when focused; sizes off
the 12-column grid; a dialog wider than 640 px.

## Token appendix

Drop-in replacement for `src/app.css` `:root`.

```css
:root {
  /* canvas */
  --vw: 1280px; --vh: 720px;
  --safe-x: 64px; --safe-y: 36px;
  --grid-cols: 12; --gutter: 24px; --col: 74px;
  --row-gap: 32px;

  /* surface */
  --bg: #10141c;
  --surface: #1a2029;
  --surface-2: #212a35;
  --text: #e8edf2;
  --dim: #8a94a6;
  --faint: #5a6472;
  --accent: #f2a33c;
  --accent-soft: rgba(242, 163, 60, 0.16);
  --live: #53d2e1;
  --live-soft: rgba(83, 210, 225, 0.14);

  /* type */
  --fs-caption: 12px; --fs-label: 14px; --fs-body: 16px;
  --fs-title: 20px; --fs-headline: 26px; --fs-display: 36px;
  --lh-tight: 1.2; --lh-body: 1.4;
  --font-display: 'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif;
  --font-body: 'Segoe UI', system-ui, -apple-system, sans-serif;

  /* shape & motion */
  --radius: 10px; --radius-lg: 14px;
  --ring: 2px;
  --dur-in: 120ms; --dur-out: 160ms; --dur-max: 200ms;
  --ease: cubic-bezier(0.2, 0.7, 0.3, 1);
  --scale-icon: 1.08; --scale-card: 1.06; --scale-hero: 1.04;
}

.focusable {
  border: var(--ring) solid transparent;
  transition: transform var(--dur-in) var(--ease),
              border-color var(--dur-in) var(--ease);
}
.focusable.focused {
  transform: scale(var(--scale-card));
  border-color: var(--accent);
  will-change: transform;
}
.focusable:not(.focused) { will-change: auto; }

@media (prefers-reduced-motion: reduce) {
  :root { --dur-in: 1ms; --dur-out: 1ms; --scale-card: 1; --scale-icon: 1; --scale-hero: 1; }
}
```

Matching TS map for anything computed in script:

```ts
export const T = {
  safe: { x: 64, y: 36 },
  grid: { cols: 12, gutter: 24, col: 74 },
  fs: { caption: 12, label: 14, body: 16, title: 20, headline: 26, display: 36 },
  dur: { in: 120, out: 160, max: 200 },
  scale: { icon: 1.08, card: 1.06, hero: 1.04 },
  budget: { bundleKb: 150, paintMs: 100, shelves: 5, focusables: 60, layers: 8, artMb: 40 },
} as const;
```

## Anti-pattern table

| Don't | Do |
|---|---|
| `transition: all` | name the two properties |
| `box-shadow` focus | 2 px border + scale |
| 13 px labels | 14 px minimum |
| `outline: none` | custom ring on every focusable |
| `backdrop-filter` | flat scrim |
| `100vh` / breakpoints | fixed 1280×720 |
| tab order | spatial engine |
| spinner on boot | skeleton in final geometry |
| 4K art in a tile | art at display size |
| `import *` | named imports |
| `requestIdleCallback` | 1.5 s interaction debounce |
| reset focus on close | restore the trigger |

## Pre-ship checklist

- [ ] Every focusable has default/focused/pressed/disabled states.
- [ ] Focus is never lost; back pops one level; root asks before exit.
- [ ] All primary content inside 64/36 px safe area.
- [ ] Body text ≥ 16 px; no weight below 500 above 12 px.
- [ ] Focus identifiable from 3 m with two cues.
- [ ] Only `transform`/`opacity` animate; ≤ 200 ms.
- [ ] No blur, shadow or filter on moving elements.
- [ ] Keypress handler does no layout read, decode or fetch.
- [ ] ≤ 5 shelves, ≤ 60 focusables, ≤ 8 layers mounted.
- [ ] Images at display size, lazy + async, offscreen released.
- [ ] Loading, empty, error, offline states all defined.
- [ ] `prefers-reduced-motion` honoured.
- [ ] Bundle ≤ 150 KB gzip.
- [ ] Back handled for `461`, `8`, `Backspace`; not `27`.
- [ ] No unverified CSS feature is load-bearing.
