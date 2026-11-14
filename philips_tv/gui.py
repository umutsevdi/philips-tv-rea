"""Tkinter control console for philips-tv-rea.

Design: AV-receiver front panel. Dark slate surfaces, keycap-style remote
buttons, one warm-amber accent, monospace activity log. Every request to
the TV is logged with timestamp, status and latency.
"""
import json
import queue
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox

from .tv import PhilipsTV, KNOWN_KEYS
from .discovery import discover
from .pairing import pair as pair_flow
from . import config
from .transport import JointSpaceTransport

# ---- palette: dark hardware -------------------------------------------------
BG        = "#14171B"
PANEL     = "#1C2127"
RAISED    = "#232930"
KEYCAP    = "#2B323B"
KEYCAP_HI = "#39424D"
EDGE      = "#2A3038"
EDGE_SOFT = "#20252B"
FG        = "#C9CFD6"
BRIGHT    = "#E8ECF1"
DIM       = "#7A828C"
AMBER     = "#E5A84B"
AMBER_DIM = "#5A4A2E"
OK        = "#6FBF8F"
ERR       = "#D9705F"
LOG_BG    = "#101316"

MONO       = ("DejaVuSansMono", 10)
MONO_SMALL = ("DejaVuSansMono", 8)
SANS       = ("DejaVuSans", 10)
SANS_SMALL = ("DejaVuSans", 9)
SANS_BOLD  = ("DejaVuSans", 10, "bold")
DISPLAY    = ("DejaVuSans", 34, "bold")

KEY_GROUPS = [
    # (group, [(label, api_key)])
    ("navigation", [
        ("Home", "Home"), ("Back", "Back"), ("Options", "Options"),
        ("Confirm", "Confirm"), ("Info", "Info"), ("Find", "Find"), ("Adjust", "Adjust"),
    ]),
    ("media", [
        ("⏵", "PlayPause"), ("⏹", "Stop"), ("⏩", "FastForward"), ("⏪", "Rewind"),
        ("⏭", "Next"), ("⏮", "Previous"),
    ]),
    ("channels", [
        ("Ch +", "ChannelStepUp"), ("Ch −", "ChannelStepDown"), ("List", "List"),
        ("Source", "Source"), ("TXT", "Teletext"), ("Sub", "Subtitle"),
    ]),
    ("colour", [
        ("●", "RedColour"), ("●", "GreenColour"), ("●", "YellowColour"), ("●", "BlueColour"),
    ]),
]
COLOUR_KEY_COLOURS = {"RedColour": "#D9705F", "GreenColour": "#6FBF8F",
                      "YellowColour": "#E5C84B", "BlueColour": "#5B8DD9"}


class ActivityLog(tk.Frame):
    """Monospace activity console; the transport's log_fn feeds it."""

    def __init__(self, master):
        super().__init__(master, bg=PANEL)
        head = tk.Frame(self, bg=PANEL)
        head.pack(fill="x")
        tk.Label(head, text="Activity", bg=PANEL, fg=AMBER,
                 font=SANS_BOLD).pack(side="left", padx=12, pady=(8, 4))
        self.count = tk.StringVar(value="0")
        tk.Label(head, textvariable=self.count, bg=PANEL, fg=DIM,
                 font=MONO_SMALL).pack(side="right", padx=12, pady=(8, 4))
        self.text = tk.Text(self, bg=LOG_BG, fg=FG, font=MONO_SMALL,
                            relief="flat", bd=0, wrap="none",
                            insertbackground=FG, selectbackground="#333A42",
                            padx=10, pady=6)
        self.text.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        for tag, colour in (("dir", DIM), ("req", AMBER), ("ok", OK),
                            ("err", ERR), ("dim", DIM)):
            self.text.tag_configure(tag, foreground=colour)
        self.text.configure(state="disabled")
        self._n = 0
        self._q = queue.Queue()
        self._drain()

    def log(self, line):
        self._q.put(line)

    def _drain(self):
        try:
            while True:
                line = self._q.get_nowait()
                self._n += 1
                self.count.set(f"{self._n} calls")
                self.text.configure(state="normal")
                ts = time.strftime("%H:%M:%S")
                if line.startswith("← 401"):
                    tag = "dim"       # digest challenge retry — normal, not an error
                elif line.startswith("← 2"):
                    tag = "ok"
                elif line.startswith("← 4") or line.startswith("← 5"):
                    tag = "err"
                elif line.startswith("→"):
                    tag = "req"
                else:
                    tag = "dim"
                self.text.insert("end", f"{ts}  ", "dim")
                self.text.insert("end", line + "\n", tag)
                self.text.see("end")
                self.text.configure(state="disabled")
        except queue.Empty:
            pass
        self.after(150, self._drain)


class TVGui:
    def __init__(self, tv: PhilipsTV):
        self.tv = tv
        self.transport = tv.transport
        self.root = tk.Tk()
        self.root.title("philips-tv-rea")
        self.root.configure(bg=BG)
        self.root.geometry("1240x1040")
        self.root.minsize(1080, 880)
        self._style()
        self._build()
        self.transport.log_fn = self.log
        self.vol_sending = False
        self._poll()

    # ---- theme ----------------------------------------------------------

    def _style(self):
        s = ttk.Style()
        s.theme_use("clam")
        s.configure("TFrame", background=BG)
        s.configure("Panel.TFrame", background=PANEL)
        s.configure("TLabel", background=BG, foreground=FG, font=SANS)
        s.configure("P.TLabel", background=PANEL, foreground=FG, font=SANS)
        s.configure("Dim.TLabel", background=PANEL, foreground=DIM, font=MONO_SMALL)
        s.configure("Amber.TLabel", background=PANEL, foreground=AMBER, font=SANS_BOLD)
        s.configure("TButton", background=KEYCAP, foreground=BRIGHT, font=SANS_SMALL,
                    borderwidth=0, focusthickness=1, focuscolor=AMBER,
                    padding=(8, 6))
        s.map("TButton",
              background=[("pressed", AMBER_DIM), ("active", KEYCAP_HI)])
        s.configure("Warn.TButton", background="#33241F", foreground=ERR, font=SANS_SMALL,
                    borderwidth=0, padding=(8, 6))
        s.map("Warn.TButton", background=[("active", "#46281f"), ("pressed", AMBER_DIM)])
        s.configure("TCheckbutton", background=BG, foreground=FG, font=SANS)
        s.map("TCheckbutton", background=[("active", BG)])
        s.configure("Horizontal.TScale", background=BG, troughcolor=LOG_BG,
                    bordercolor=BG, lightcolor=AMBER, darkcolor=AMBER)
        s.configure("Status.TLabel", background=PANEL, foreground=DIM, font=MONO_SMALL)

    # ---- layout ---------------------------------------------------------

    def _build(self):
        root = ttk.Frame(self.root)
        root.pack(fill="both", expand=True)

        # ============ column 1: identity ================================
        left = tk.Frame(root, bg=PANEL, width=240)
        left.grid(row=0, column=0, sticky="nsew")
        left.pack_propagate(False)

        tk.Label(left, text="philips-tv-rea", bg=PANEL, fg=AMBER,
                 font=SANS_BOLD, anchor="w").pack(fill="x", padx=16, pady=(16, 0))
        tk.Label(left, text="JointSpace v6", bg=PANEL, fg=DIM,
                 font=MONO_SMALL, anchor="w").pack(fill="x", padx=16, pady=(0, 12))
        tk.Frame(left, bg=EDGE, height=1).pack(fill="x")

        self.info_vars = {}
        for label in ("name", "model", "serialnumber", "softwareversion", "api_version"):
            row = tk.Frame(left, bg=PANEL)
            row.pack(fill="x", padx=16, pady=(6, 0))
            tk.Label(row, text=label, bg=PANEL, fg=DIM, font=MONO_SMALL,
                     width=12, anchor="w").pack(side="left")
            var = tk.StringVar(value="…")
            tk.Label(row, textvariable=var, bg=PANEL, fg=BRIGHT, font=MONO_SMALL,
                     anchor="w").pack(side="left", fill="x", expand=True)
            self.info_vars[label] = var

        tk.Frame(left, bg=EDGE, height=1).pack(fill="x", pady=12)
        tk.Label(left, text="Context", bg=PANEL, fg=DIM, font=MONO_SMALL,
                 anchor="w").pack(fill="x", padx=16, pady=(0, 4))
        self.ctx_var = tk.StringVar(value="…")
        tk.Label(left, textvariable=self.ctx_var, bg=PANEL, fg=FG, font=MONO_SMALL,
                 justify="left", anchor="nw", wraplength=200).pack(fill="x", padx=16)

        tk.Frame(left, bg=EDGE, height=1).pack(fill="x", pady=12)
        tk.Label(left, text="Channel", bg=PANEL, fg=DIM, font=MONO_SMALL,
                 anchor="w").pack(fill="x", padx=16, pady=(0, 4))
        self.chan_var = tk.StringVar(value="…")
        tk.Label(left, textvariable=self.chan_var, bg=PANEL, fg=FG, font=MONO_SMALL,
                 justify="left", anchor="nw", wraplength=200).pack(fill="x", padx=16)

        self.amb_var = tk.StringVar(value="")

        # bottom: connection + standby
        bot = tk.Frame(left, bg=PANEL)
        bot.pack(side="bottom", fill="x", pady=12)

        hints = tk.Frame(bot, bg=PANEL)
        hints.pack(fill="x", padx=16, pady=(10, 6))
        for line in (
            "←→↑↓  navigate",
            "⏢  OK / confirm",
            "0-9  channel digits",
            "Esc / ⌫  back",
            "h  home   m  mute",
            "+ / −  volume",
            "o  options   i  info",
            "p  standby",
        ):
            tk.Label(hints, text=line, bg=PANEL, fg=DIM, font=MONO_SMALL,
                     anchor="w").pack(fill="x")

        btnrow = tk.Frame(bot, bg=PANEL)
        btnrow.pack(fill="x", padx=16, pady=(8, 6))
        btnrow.columnconfigure(0, weight=1)
        btnrow.columnconfigure(1, weight=1)
        ttk.Button(btnrow, text="Reconnect", command=self._on_reconnect).grid(
            row=0, column=0, sticky="ew", padx=(0, 4))
        ttk.Button(btnrow, text="Standby", style="Warn.TButton",
                   command=self._on_standby).grid(row=0, column=1, sticky="ew", padx=(4, 0))


        # ============ column 2: volume + remote (scrollable) =============
        outer = tk.Frame(root, bg=BG)
        outer.grid(row=0, column=1, sticky="nsew", padx=18, pady=14)
        outer.rowconfigure(0, weight=1)
        outer.columnconfigure(0, weight=1)

        canvas = tk.Canvas(outer, bg=BG, highlightthickness=0, bd=0)
        canvas.grid(row=0, column=0, sticky="nsew")
        vs = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        vs.grid(row=0, column=1, sticky="ns")
        canvas.configure(yscrollcommand=vs.set)

        mid = tk.Frame(canvas, bg=BG)
        canvas.create_window((0, 0), window=mid, anchor="nw", tags="inner")

        def _on_inner_configure(event):
            canvas.configure(scrollregion=canvas.bbox("all"))
            # show scrollbar only when content actually overflows
            inner_h = mid.winfo_reqheight()
            if inner_h <= canvas.winfo_height():
                vs.grid_remove()
            else:
                vs.grid()
        mid.bind("<Configure>", _on_inner_configure)

        def _on_canvas_configure(event):
            # keep the inner frame as wide as the canvas so children stretch
            canvas.itemconfigure("inner", width=event.width)
        canvas.bind("<Configure>", _on_canvas_configure)

        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        # wheel scrolling only when the cursor is over the keypad canvas
        # (bind on widgets, not bind_all, so the log pane scrolls independently)
        for widget in (canvas, mid):
            widget.bind("<MouseWheel>", _on_mousewheel)
            widget.bind("<Button-4>", lambda e: canvas.yview_scroll(-1, "units"))
            widget.bind("<Button-5>", lambda e: canvas.yview_scroll(1, "units"))
        def _bind_tree(w):
            for child in w.winfo_children():
                child.bind("<MouseWheel>", _on_mousewheel)
                child.bind("<Button-4>", lambda e: canvas.yview_scroll(-1, "units"))
                child.bind("<Button-5>", lambda e: canvas.yview_scroll(1, "units"))
                _bind_tree(child)
        mid.bind("<Map>", lambda e: _bind_tree(mid))

        # volume instrument: one row — number, slider, mute
        vol_card = tk.Frame(mid, bg=PANEL)
        vol_card.pack(fill="x", pady=(0, 12))
        row = tk.Frame(vol_card, bg=PANEL)
        row.pack(fill="x", padx=14, pady=12)
        self.vol_display = tk.Label(row, text="--", bg=PANEL, fg=BRIGHT,
                                    font=("DejaVuSans", 16, "bold"), width=3)
        self.vol_display.pack(side="left")
        self.vol_value = tk.IntVar(value=33)
        self.vol_scale = ttk.Scale(row, from_=0, to=60, orient="horizontal",
                                   variable=self.vol_value, command=self._on_slider)
        self.vol_scale.pack(side="left", fill="x", expand=True, padx=(12, 12))
        self.muted_var = tk.BooleanVar(value=False)
        self.mute_btn = ttk.Button(row, text="Mute", width=6,
                                   command=self._on_mute)
        self.mute_btn.pack(side="right")
        self._muted = False

        # ---- numpad: 7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0 · ----
        num_card = tk.Frame(mid, bg=PANEL)
        num_card.pack(fill="x", pady=(12, 0))
        tk.Label(num_card, text="DIGITS", bg=PANEL, fg=DIM,
                 font=MONO_SMALL, anchor="w").pack(fill="x", padx=12, pady=(6, 0))
        num = tk.Frame(num_card, bg=PANEL)
        num.pack(fill="x", padx=90, pady=(2, 8))
        num_layout = [
            ("7", "Digit7"), ("8", "Digit8"), ("9", "Digit9"),
            ("4", "Digit4"), ("5", "Digit5"), ("6", "Digit6"),
            ("1", "Digit1"), ("2", "Digit2"), ("3", "Digit3"),
            ("⌫", "Back"), ("0", "Digit0"), ("·", "Dot"),
        ]
        for i, (label, api_key) in enumerate(num_layout):
            tk.Button(num, text=label, bg=KEYCAP, fg=BRIGHT,
                      activebackground=KEYCAP_HI, activeforeground=BRIGHT,
                      relief="flat", bd=0, font=("DejaVuSans", 11),
                      cursor="hand2", command=lambda a=api_key: self._send_key(a)
                      ).grid(row=i // 3, column=i % 3, padx=2, pady=2, sticky="ew")
        for c in range(3):
            num.columnconfigure(c, weight=1, uniform="num")
        for r in range(4):
            num.rowconfigure(r, weight=1)

        # ---- D-pad: cross layout with Confirm center ----
        dpad_card = tk.Frame(mid, bg=PANEL)
        dpad_card.pack(fill="x", pady=(12, 0))
        tk.Label(dpad_card, text="NAVIGATE", bg=PANEL, fg=DIM,
                 font=MONO_SMALL, anchor="w").pack(fill="x", padx=12, pady=(6, 0))
        dpad = tk.Frame(dpad_card, bg=PANEL)
        dpad.pack(fill="x", padx=90, pady=(2, 8))
        dpad.columnconfigure(0, weight=1)
        dpad.columnconfigure(1, weight=1)
        dpad.columnconfigure(2, weight=1)

        def dpad_btn(row, col, symbol, api_key):
            tk.Button(dpad, text=symbol, bg=KEYCAP, fg=BRIGHT,
                      activebackground=KEYCAP_HI, activeforeground=BRIGHT,
                      relief="flat", bd=0, font=("DejaVuSans", 11),
                      cursor="hand2", command=lambda a=api_key: self._send_key(a)
                      ).grid(row=row, column=col, padx=2, pady=2, sticky="ew")
        dpad_btn(0, 1, "▲", "CursorUp")
        dpad_btn(1, 0, "◀", "CursorLeft")
        dpad_btn(1, 1, "OK", "Confirm")
        dpad_btn(1, 2, "▶", "CursorRight")
        dpad_btn(2, 1, "▼", "CursorDown")
        for c in range(3):
            dpad.columnconfigure(c, weight=1, uniform="dpad")
        for r in range(3):
            dpad.rowconfigure(r, weight=1)

        # remote panel: one continuous surface, groups separated by hairlines
        remote = tk.Frame(mid, bg=PANEL)
        remote.pack(fill="both", expand=True, pady=(14, 0))

        first = True
        for group, keys in KEY_GROUPS:
            if not first:
                tk.Frame(remote, bg=EDGE_SOFT, height=1).pack(fill="x")
            first = False
            tk.Label(remote, text=group.upper(), bg=PANEL, fg=DIM,
                     font=MONO_SMALL, anchor="w").pack(fill="x",
                     padx=(12, 0), pady=(6, 1))
            grid = tk.Frame(remote, bg=PANEL)
            grid.pack(fill="x", padx=10, pady=(0, 4))
            cols = 4 if len(keys) >= 4 else len(keys)
            rows = (len(keys) + cols - 1) // cols
            for i, (label, api_key) in enumerate(keys):
                colour = COLOUR_KEY_COLOURS.get(api_key)
                if colour:
                    btn = tk.Button(grid, text=label, bg=colour, fg=BG,
                                    activebackground=colour, activeforeground=BG,
                                    relief="flat", bd=0, font=("DejaVuSans", 11, "bold"),
                                    cursor="hand2",
                                    command=lambda a=api_key: self._send_key(a))
                else:
                    btn = ttk.Button(grid, text=label, style="TButton",
                                     command=lambda a=api_key: self._send_key(a))
                btn.grid(row=i // cols, column=i % cols, padx=3, pady=3, sticky="nsew")
            for c in range(cols):
                grid.columnconfigure(c, weight=1, uniform="keycap")
            for r in range(rows):
                grid.rowconfigure(r, weight=1)

        # ============ column 3: activity log ============================
        right = tk.Frame(root, bg=PANEL, width=420)
        right.grid(row=0, column=2, sticky="nsew", padx=(1, 0))
        right.pack_propagate(False)
        self.console = ActivityLog(right)
        self.console.pack(fill="both", expand=True)

        # status bar
        # consolidated status line: dot, connection state, last event
        status = tk.Frame(self.root, bg=PANEL)
        status.pack(fill="x", side="bottom")
        self.conn_dot = tk.Canvas(status, width=8, height=8, bg=PANEL, highlightthickness=0)
        self.conn_dot.pack(side="left", padx=(12, 5))
        self._conn_dot_item = self.conn_dot.create_oval(1, 1, 7, 7, fill=DIM, outline="")
        self.conn_var = tk.StringVar(value="connecting…")
        tk.Label(status, textvariable=self.conn_var, bg=PANEL, fg=DIM,
                 font=MONO_SMALL).pack(side="left")
        self.status_var = tk.StringVar(value="")
        ttk.Label(status, textvariable=self.status_var, style="Status.TLabel",
                  anchor="w").pack(side="left", fill="x", expand=True, padx=12)
        ttk.Label(status, textvariable=self.amb_var, style="Status.TLabel").pack(
            side="right", padx=12)

        self._bind_keyboard()

        root.columnconfigure(1, weight=1)
        root.columnconfigure(2, weight=1)
        root.rowconfigure(0, weight=1)

    # ---- keyboard ----------------------------------------------------

    def _bind_keyboard(self):
        """Map desktop keyboard to remote: arrows drive the TV cursor, the
        number row and numpad send digits, Enter confirms, Esc/Backspace go
        back. Volume: +/- ; Mute: m ; Home: h ; Standby: p."""
        def k(event):
            key = event.keysym
            state = event.state & 0x000F  # ignore caps/num lock modifiers
            if state & 0x1:  # shift held — let Shift+arrows etc through? no text inputs, still map
                pass
            simple = {
                "Up": "CursorUp", "Down": "CursorDown",
                "Left": "CursorLeft", "Right": "CursorRight",
                "Return": "Confirm", "KP_Enter": "Confirm",
                "BackSpace": "Back", "Escape": "Back",
                "h": "Home", "H": "Home",
                "m": "Mute", "M": "Mute",
                "o": "Options", "O": "Options",
                "i": "Info", "I": "Info",
                "p": None,  # standby — handled specially below
                "plus": "VolumeUp", "equal": "VolumeUp",
                "minus": "VolumeDown", "underscore": "VolumeDown",
                "KP_Add": "VolumeUp", "KP_Subtract": "VolumeDown",
            }
            digits = {
                "0": "Digit0", "1": "Digit1", "2": "Digit2", "3": "Digit3",
                "4": "Digit4", "5": "Digit5", "6": "Digit6", "7": "Digit7",
                "8": "Digit8", "9": "Digit9",
                "KP_0": "Digit0", "KP_1": "Digit1", "KP_2": "Digit2",
                "KP_3": "Digit3", "KP_4": "Digit4", "KP_5": "Digit5",
                "KP_6": "Digit6", "KP_7": "Digit7", "KP_8": "Digit8",
                "KP_9": "Digit9",
            }
            if key in simple:
                target = simple[key]
                if target is None:
                    self._on_standby()
                    return "break"
                self._send_key(target)
                return "break"
            if key in digits:
                self._send_key(digits[key])
                return "break"
            return None

        self.root.bind("<Key>", k)

    # ---- plumbing --------------------------------------------------------

    def log(self, line):
        self.console.log(line)

    def _bg(self, fn, on_done, on_error=None):
        def runner():
            try:
                result = fn()
                self.root.after(0, lambda: on_done(result))
            except Exception as exc:  # noqa: BLE001
                self.root.after(0, lambda: (on_error(str(exc)) if on_error else
                                            self.status_var.set(f"error: {exc}")))
        threading.Thread(target=runner, daemon=True).start()

    def _poll(self):
        def fetch():
            vol, ctx, ok = {}, {}, True
            try:
                vol = self.tv.volume()
                ctx = self.tv.context()
            except Exception:
                ok = False
            activities = {}
            try:
                r = self.tv.transport.get("/6/activities/tv")
                if r.status == 200:
                    activities = r.json() or {}
            except Exception:
                pass
            ambilight = ""
            try:
                r = self.tv.transport.get("/6/ambilight/power")
                if r.status == 200:
                    ambilight = (r.json() or {}).get("power", "")
            except Exception:
                pass
            return (vol, ctx, ok, activities, ambilight)
        self._bg(fetch, self._apply_state)
        self.root.after(3000, self._poll)

    def _apply_state(self, result):
        vol, ctx, alive, activities, ambilight = result
        if not alive or (not vol and not ctx):
            self.conn_dot.itemconfig(self._conn_dot_item, fill=ERR)
            self.conn_var.set("TV not responding — power-cycle at the wall")
            return
        self.conn_dot.itemconfig(self._conn_dot_item, fill=OK)
        self.conn_var.set("connected")
        # channel line under context
        ch = (activities or {}).get("channel") or {}
        ccl = (activities or {}).get("channelList") or {}
        if ch and ccl:
            name = ch.get("name", "")
            num = ch.get("preset_number", "")
            line = f"{num} {name}".strip() or "channel unknown"
            self.chan_var.set(line)
        elif ch == {} and ccl == {}:
            self.chan_var.set("no channel (app/input)")
        if ambilight:
            self.amb_var.set(f"Ambilight: {ambilight}")
        if vol:
            if not self.vol_sending:
                self.vol_value.set(vol.get("current", 0))
            self.vol_display.config(text=str(vol.get("current", 0)))
            muted = vol.get("muted", False)
            self._muted = muted
            self.mute_btn.configure(text="Unmute" if muted else "Mute")
            self.vol_scale.configure(to=vol.get("max", 60))
        if ctx:
            parts = [f"{k}: {v}" for k, v in ctx.items() if v not in ("NA", None, "")]
            self.ctx_var.set("\n".join(parts) or "no context reported")

    def _on_slider(self, value):
        if self.vol_sending:
            return
        level = int(float(value))
        self.vol_display.config(text=str(level))
        self.vol_sending = True
        self._bg(lambda: self.tv.set_volume(level),
                 lambda ok: setattr(self, "vol_sending", False),
                 lambda err: setattr(self, "vol_sending", False))

    def _on_mute(self):
        self._muted = not self._muted
        muted = self._muted
        self.mute_btn.configure(text="Unmute" if muted else "Mute")
        self._bg(lambda: self.tv.set_muted(muted),
                 lambda ok: self.status_var.set(f"muted: {muted}" if ok else "mute failed"))

    def _send_key(self, key):
        self._bg(lambda: self.tv.send_key(key),
                 lambda ok: self.status_var.set(f"{key}: {'sent' if ok else 'rejected'}"))

    def _on_standby(self):
        if messagebox.askyesno("Standby", "Send Standby? This powers the TV off."):
            self._send_key("Standby")

    def _on_reconnect(self):
        self.conn_dot.itemconfig(self._conn_dot_item, fill=DIM)
        self.conn_var.set("reconnecting…")
        self._bg(lambda: self.tv.volume(),
                 lambda v: self.conn_var.set("connected"),
                 lambda err: (self.conn_dot.itemconfig(self._conn_dot_item, fill=ERR),
                              self.conn_var.set("failed — power-cycle the TV")))

    def run(self):
        self._bg(lambda: self.tv.system(decrypt=True),
                 lambda data: [self.info_vars[k].set(
                     (f"{data[k].get('Major', 0)}.{data[k].get('Minor', 0)}."
                      f"{data[k].get('Patch', 0)}"
                      if k == "api_version" and isinstance(data.get(k), dict)
                      else str(data.get(k, "-")) or "-"))
                     for k in self.info_vars])
        self.root.mainloop()


def run(tv: PhilipsTV) -> None:
    try:
        TVGui(tv).run()
    except tk.TclError as exc:
        messagebox.showerror("philips-tv-rea", f"Cannot open display: {exc}")
