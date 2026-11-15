/* Remote keymap for the Philips/Titan device class (docs/02) plus browser
   fallbacks. 401-406 are HbbTV colour keys, 461 is the Vewd back key. */

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'enter' | 'back' | 'backspace'
  | 'red' | 'green' | 'yellow' | 'blue'
  | 'ch-up' | 'ch-down';

const KEYMAP: Record<string, Action> = {
  // D-pad: modern key names and legacy codes
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  // enter / back
  Enter: 'enter',
  Backspace: 'back',
  // Vewd back key
  Unidentified: 'back', // code 461 surfaces as Unidentified on some builds; handled by keyCode below
  // colour keys: string names (newer) and HbbTV codes
  Red: 'red', Green: 'green', Yellow: 'yellow', Blue: 'blue',
  PageUp: 'ch-up', PageDown: 'ch-down',
};

const CODEMAP: Record<number, Action> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down',
  13: 'enter', 8: 'backspace',
  461: 'back',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
  402: 'ch-up', 401: 'ch-down',
  112: 'red', 113: 'green', 114: 'yellow', 115: 'blue',
};

export function actionFor(e: KeyboardEvent): Action | null {
  return CODEMAP[e.keyCode] ?? KEYMAP[e.key] ?? null;
}

/* Dedicated app keys on the Titan remote (Netflix / Prime Video / YouTube /
   Disney+ …). The stock launcher turns them into launch intents; on the
   replacement page they can only arrive as key events, and their codes
   aren't in the captured bundles. Mapped by key name where the browser
   reports one; every unknown key is logged with its keyCode so the
   on-device probe can fill this table (09/U-probe). */
const HOTKEYS: Record<string, string> = {
  Netflix: 'netflix',
  PrimeVideo: 'prime',
  YouTube: 'youtube',
  Disney: 'disney',
};

export function hotkeyFor(e: KeyboardEvent): string | null {
  return HOTKEYS[e.key] ?? null;
}

/* Long-press detection, mirroring the stock launcher's NCe helper:
   fires once after HOLD_MS, resets on keyup. */
export class LongPress {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private key: string | null = null;

  constructor(private readonly onLong: (a: Action) => void, private readonly holdMs = 600) {}

  start(a: Action): void {
    if (a !== 'enter' && a !== 'left' && a !== 'right' && a !== 'up' && a !== 'down') return;
    this.key = a + ':' + Math.random();
    const k = this.key;
    this.timer = setTimeout(() => {
      if (this.key === k) { this.onLong(a); this.key = null; }
    }, this.holdMs);
  }

  stop(): void {
    this.key = null;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
