"""Tkinter control console for philips-tv-rea.

Layout (user spec): 
  column 1: TV info bar, standby, connect
  column 2: compact keypads, volume slider
  column 3: tall activity log
"""
import json
import queue
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox

from .tv import PhilipsTV, KNOWN_KEYS
from .transport import JointSpaceTransport
from .discovery import discover
from .pairing import pair as pair_flow
from . import config

BG = "#16191D"
PANEL = "#1E2227"
PANEL_EDGE = "#2B3037"
FG = "#D6DAE0"
DIM = "#8A9199"
AMBER = "#E8A33D"
OK = "#7FB069"
ERR = "#E06C5B"
MONO = ("DejaVuSansMono", 9)
MONO_SMALL = ("DejaVuSansMono", 8)
SANS = ("DejaVuSans", 9)
SANS_BOLD = ("DejaVuSans", 9, "bold")
SANS_BIG = ("DejaVuSans", 22, "bold")

KEY_GROUPS = [
    ("Nav", ["Home", "Back", "Options", "Confirm", "Info", "Find", "Adjust"]),
    ("Arrows (in apps)", ["▲", "▼", "◀", "▶"]),
    ("Media", ["PlayPause", "Stop", "FF", "Rew", "Next", "Prev"]),
    ("TV", ["Source", "Ch+", "Ch-", "ChList", "TXT", "Sub"]),
    ("Colour", ["Red", "Green", "Yellow", "Blue"]),
    ("Digits", [f"Digit{i}" for i in range(10)]),
]
# map short GUI labels back to API key names
LABEL_TO_KEY = {
    "FF": "FastForward", "Rew": "Rewind", "Next": "Next", "Prev": "Previous",
    "Ch+": "ChannelStepUp", "Ch-": "ChannelStepDown", "ChList": "ChannelList",
    "TXT": "Teletext", "Sub": "Subtitle", "Red": "RedColour", "Green": "GreenColour",
    "Yellow": "YellowColour", "Blue": "BlueColour",
    "ArrowUp": "ArrowUp", "ArrowDown": "ArrowDown", "ArrowLeft": "ArrowLeft",
    "ArrowRight": "ArrowRight",
}


class TVGui:
    def __init__(self, tv: PhilipsTV):
        self.tv = tv
        self.transport = tv.transport
        self.root = tk.Tk()
        self.root.title("philips-tv-rea")
        self.root.configure(bg=BG)
        self.root.geometry("1240x780")
        self.root.minsize(1024, 640)
        self._style()
        cfg = config.load()
        if not cfg:
            if not self._first_run_setup():
                raise SystemExit(1)
        self._build()
        self.transport.log_fn = self.log
        self.vol_sending = False
        self._poll()

    def _first_run_setup(self):
        """Discover TVs on the LAN, pair with the chosen one."""
        dlg = tk.Toplevel(self.root)
        dlg.title("Pair a TV")
        dlg.configure(bg=BG)
        dlg.geometry("460x260")
        dlg.grab_set()
        tk.Label(dlg, text="No paired TV found.", bg=BG, fg=FG,
                 font=SANS_BOLD).pack(anchor="w", padx=16, pady=(16, 4))
        tk.Label(dlg, text="Searching the local network...", bg=BG, fg=DIM,
                 font=MONO_SMALL).pack(anchor="w", padx=16)
        result = {"tv": None}

        listbox = None

        def do_pair():
            sel = result["tv"]
            if not sel:
                return
            pin_win = tk.Toplevel(dlg)
            pin_win.title("PIN")
            pin_win.configure(bg=BG)
            tk.Label(pin_win, text="A 4-digit PIN should now show on the TV.", bg=BG,
                     fg=FG, font=SANS).pack(padx=16, pady=(16, 4))
            pin_entry = tk.Entry(pin_win, font=MONO, width=8, show="",
                                 insertbackground=FG, bg="#101316", fg=FG,
                                 relief="flat")
            pin_entry.pack(padx=16, pady=4)
            pin_entry.focus_set()

            def confirm():
                pin = pin_entry.get().strip()
                pin_win.destroy()
                transport = JointSpaceTransport(sel.host)
                try:
                    creds = pair_flow(transport, device_name="philips-tv-rea",
                                      pin_callback=lambda: pin)
                    config.save(sel.host, creds)
                    dlg.destroy()
                    messagebox.showinfo("Paired", f"Paired with {sel.model or sel.host}")
                except Exception as exc:  # noqa: BLE001
                    messagebox.showerror("Pairing failed", str(exc))

            ttk.Button(pin_win, text="Pair", command=confirm).pack(pady=8)

        def on_select(event):
            sel = listbox.curselection()
            if sel:
                result["tv"] = found_tvs[sel[0]]
                do_pair()

        def run_discovery():
            found = discover(timeout=4)
            if not found:
                return
            found_tvs[:] = found
            listbox.delete(0, tk.END)
            for t in found:
                listbox.insert(tk.END, f"{t.model or 'unknown TV'}  ({t.host})")

        found_tvs = []
        listbox = tk.Listbox(dlg, bg="#101316", fg=FG, font=MONO_SMALL,
                             relief="flat", selectbackground="#333A42", height=6)
        listbox.pack(fill="both", expand=True, padx=16, pady=8)
        listbox.bind("<Double-1>", on_select)
        ttk.Button(dlg, text="Search again", command=run_discovery).pack(pady=(0, 12))
        threading.Thread(target=lambda: dlg.after(0, run_discovery), daemon=True).start()
        self.root.wait_window(dlg)
        return config.load() is not None

    def _style(self):
        s = ttk.Style()
        s.theme_use("clam")
        s.configure("TFrame", background=BG)
        s.configure("Panel.TFrame", background=PANEL)
        s.configure("TLabel", background=BG, foreground=FG, font=SANS)
        s.configure("Dim.TLabel", background=BG, foreground=DIM, font=MONO_SMALL)
        s.configure("Amber.TLabel", background=BG, foreground=AMBER, font=SANS_BOLD)
        s.configure("TButton", background=PANEL, foreground=FG, font=SANS)
        s.map("TButton", background=[("active", "#2C323A")])
        s.configure("Pad.TButton", background="#2A2F36", foreground=FG,
                    font=MONO_SMALL)
        s.map("Pad.TButton", background=[("active", "#3A424D"), ("pressed", "#5A4720")])
        s.configure("Warn.TButton", background="#3A2A28", foreground=ERR, font=SANS)
        s.map("Warn.TButton", background=[("active", "#4A332F")])
        s.configure("TCheckbutton", background=BG, foreground=FG)
        s.configure("Horizontal.TScale", background=PANEL, troughcolor="#101316",
                    lightcolor=AMBER, darkcolor=AMBER)
        s.configure("Status.TLabel", background=PANEL, foreground=DIM, font=MONO_SMALL)

    def _build(self):
        main = ttk.Frame(self.root)
        main.pack(fill="both", expand=True)
        main.columnconfigure(0, weight=0)
        main.columnconfigure(1, weight=0)
        main.columnconfigure(2, weight=1)   # log takes remaining width
        main.rowconfigure(0, weight=1)

        # ================= column 1: TV info + standby + connect =================
        left = tk.Frame(main, bg=PANEL, width=230)
        left.grid(row=0, column=0, sticky="nsew")
        left.pack_propagate(False)

        tk.Label(left, text="philips-tv-rea", bg=PANEL, fg=AMBER,
                 font=SANS_BOLD).pack(anchor="w", padx=14, pady=(14, 0))
        tk.Label(left, text="JointSpace v6 console", bg=PANEL, fg=DIM,
                 font=MONO_SMALL).pack(anchor="w", padx=14, pady=(0, 12))
        tk.Frame(left, bg=PANEL_EDGE, height=1).pack(fill="x")

        self.info_vars = {}
        for label in ("name", "model", "serialnumber", "softwareversion", "api_version"):
            row = tk.Frame(left, bg=PANEL)
            row.pack(fill="x", padx=14, pady=3)
            tk.Label(row, text=label, bg=PANEL, fg=DIM, font=MONO_SMALL,
                     width=13, anchor="w").pack(side="left")
            var = tk.StringVar(value="…")
            tk.Label(row, textvariable=var, bg=PANEL, fg=FG, font=MONO_SMALL,
                     anchor="w").pack(side="left", fill="x", expand=True)
            self.info_vars[label] = var

        tk.Frame(left, bg=PANEL_EDGE, height=1).pack(fill="x", pady=10)

        tk.Label(left, text="Context", bg=PANEL, fg=AMBER, font=SANS_BOLD,
                 anchor="w").pack(fill="x", padx=14, pady=(0, 4))
        self.ctx_var = tk.StringVar(value="…")
        tk.Label(left, textvariable=self.ctx_var, bg=PANEL, fg=FG, font=MONO_SMALL,
                 justify="left", anchor="nw", wraplength=200).pack(fill="x", padx=14)

        # connect / standby pinned to bottom of col 1
        bottom = tk.Frame(left, bg=PANEL)
        bottom.pack(side="bottom", fill="x", pady=10)
        self.conn_var = tk.StringVar(value="● connected")
        tk.Label(bottom, textvariable=self.conn_var, bg=PANEL, fg=OK,
                 font=MONO_SMALL, anchor="w").pack(fill="x", padx=14, pady=(0, 8))
        ttk.Button(bottom, text="Reconnect", command=self._on_reconnect).pack(
            fill="x", padx=14, pady=(0, 4))
        ttk.Button(bottom, text="Standby", style="Warn.TButton",
                   command=self._on_standby).pack(fill="x", padx=14)

        # ================= column 2: keypads + volume =================
        mid = tk.Frame(main, bg=BG)
        mid.grid(row=0, column=1, sticky="nsew", padx=14, pady=10)

        vol = tk.Frame(mid, bg=BG)
        vol.pack(fill="x", pady=(0, 10))
        self.vol_display = tk.Label(vol, text="--", bg=BG, fg=AMBER, font=SANS_BIG)
        self.vol_display.pack(side="left")
        self.muted_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(vol, text="Mute", variable=self.muted_var,
                        command=self._on_mute).pack(side="left", padx=(12, 0))
        self.vol_value = tk.IntVar(value=33)
        self.vol_scale = ttk.Scale(mid, from_=0, to=60, variable=self.vol_value,
                                   orient="horizontal", command=self._on_slider)
        self.vol_scale.pack(fill="x", pady=(0, 12))

        for group, keys in KEY_GROUPS:
            box = tk.LabelFrame(mid, text=group, bg=BG, fg=DIM, font=MONO_SMALL)
            box.pack(fill="x", pady=(0, 6))
            cols = 6 if len(keys) == 10 else (7 if group == "Nav" else (4 if len(keys) > 4 else len(keys)))
            for ki, label in enumerate(keys):
                btn = ttk.Button(box, text=label, width=6, style="Pad.TButton",
                                 command=lambda l=label: self._send_key(l))
                btn.grid(row=ki // cols, column=ki % cols, padx=1, pady=1, sticky="ew")
            for c in range(cols):
                box.columnconfigure(c, weight=1)

        # ================= column 3: tall log =================
        right = tk.Frame(main, bg=PANEL)
        right.grid(row=0, column=2, sticky="nsew", padx=(1, 0))
        header = tk.Frame(right, bg=PANEL)
        header.pack(fill="x")
        tk.Label(header, text="Activity", bg=PANEL, fg=AMBER,
                 font=SANS_BOLD).pack(side="left", padx=(10, 0), pady=(8, 4))
        self.count_var = tk.StringVar(value="0 calls")
        tk.Label(header, textvariable=self.count_var, bg=PANEL, fg=DIM,
                 font=MONO_SMALL).pack(side="right", padx=10, pady=(8, 4))
        self.text = tk.Text(right, bg="#101316", fg=FG, font=MONO_SMALL,
                            relief="flat", bd=0, wrap="none",
                            insertbackground=FG, selectbackground="#333A42")
        self.text.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        self.text.tag_configure("req", foreground=AMBER)
        self.text.tag_configure("ok", foreground=OK)
        self.text.tag_configure("err", foreground=ERR)
        self.text.tag_configure("dim", foreground=DIM)
        self.text.configure(state="disabled")
        self._n = 0
        self._q = queue.Queue()
        self._drain()

        self.status_var = tk.StringVar(value="connecting…")
        ttk.Label(self.root, textvariable=self.status_var, style="Status.TLabel",
                  anchor="w").pack(fill="x", side="bottom")

    # -- log ----------------------------------------------------------

    def log(self, line):
        self._q.put(line)

    def _drain(self):
        try:
            while True:
                line = self._q.get_nowait()
                self._n += 1
                self.count_var.set(f"{self._n} calls")
                self.text.configure(state="normal")
                ts = time.strftime("%H:%M:%S")
                tag = ("req" if line.startswith("→") else
                       "ok" if line.startswith("← 2") else
                       "err" if line.startswith("← 4") or line.startswith("← 5") else "dim")
                self.text.insert("end", f"{ts}  ", "dim")
                self.text.insert("end", line + "\n", tag)
                self.text.see("end")
                self.text.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(150, self._drain)

    # -- plumbing ------------------------------------------------------

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
        self._bg(lambda: (self.tv.volume(), self.tv.context()), self._apply_state)
        self.root.after(3000, self._poll)

    def _apply_state(self, result):
        vol, ctx = result
        if vol:
            if not self.vol_sending:
                self.vol_value.set(vol.get("current", 0))
            self.vol_display.config(text=f"{vol.get('current', 0)}")
            self.muted_var.set(vol.get("muted", False))
        if ctx:
            parts = [f"{k}: {v}" for k, v in ctx.items() if v not in ("NA", None, "")]
            self.ctx_var.set("\n".join(parts) or "no context reported")
        self.conn_var.set("● connected")
        self.conn_var_color = OK
        self.status_var.set("connected — polling every 3 s")

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
        muted = self.muted_var.get()
        self._bg(lambda: self.tv.set_muted(muted),
                 lambda ok: self.status_var.set(f"muted: {muted}" if ok else "mute failed"))

    def _send_key(self, label):
        # NOTE: arrows do nothing on the Titan home screen (web app, no focus
        # model) — they work inside apps with their own focus lists.
        key = LABEL_TO_KEY.get(label, label)
        self._bg(lambda: self.tv.send_key(key),
                 lambda ok: self.status_var.set(f"{key}: {'sent' if ok else 'rejected'}"))

    def _on_standby(self):
        if messagebox.askyesno("Standby", "Send Standby? This powers the TV off."):
            self._send_key("Standby")

    def _on_reconnect(self):
        self.conn_var.set("● reconnecting…")
        self._bg(lambda: self.tv.volume(),
                 lambda v: self.status_var.set("reconnected"),
                 lambda err: self.conn_var.set("● connection failed — power-cycle the TV"))

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
