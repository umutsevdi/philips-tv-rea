"""Tkinter GUI for philips-tv-rea.

A single window showing live TV info, a volume slider, and a remote pad.
Standard library only; polls the TV every second in the background.
"""
import json
import threading
import tkinter as tk
from tkinter import ttk, messagebox

from .tv import PhilipsTV

REMOTE_KEYS = [
    ("Standby", 0, 0), ("Home", 1, 0), ("Back", 2, 0), ("Options", 3, 0),
    ("ArrowUp", 1, 1), ("ArrowDown", 1, 2), ("ArrowLeft", 1, 3), ("ArrowRight", 1, 4),
    ("Confirm", 2, 1), ("VolumeUp", 2, 2), ("VolumeDown", 2, 3), ("Mute", 2, 4),
    ("PlayPause", 3, 1), ("Stop", 3, 2), ("FastForward", 3, 3), ("Rewind", 3, 4),
]


class TVGui:
    def __init__(self, tv: PhilipsTV):
        self.tv = tv
        self.root = tk.Tk()
        self.root.title("philips-tv-rea")
        self.root.resizable(False, False)
        self._build()
        self._poll()

    # -- layout --------------------------------------------------------

    def _build(self):
        pad = dict(padx=8, pady=4)
        top = ttk.Frame(self.root)
        top.pack(fill="both", expand=True, **pad)

        # info pane
        info = ttk.LabelFrame(top, text="TV")
        info.grid(row=0, column=0, sticky="nw", **pad)
        self.info_vars = {}
        for i, label in enumerate(("name", "model", "serialnumber",
                                   "softwareversion", "api_version")):
            ttk.Label(info, text=label + ":").grid(row=i, column=0, sticky="e", **pad)
            var = tk.StringVar(value="-")
            ttk.Label(info, textvariable=var, width=32).grid(row=i, column=1, sticky="w", **pad)
            self.info_vars[label] = var

        # context pane
        ctx = ttk.LabelFrame(top, text="Current context")
        ctx.grid(row=1, column=0, sticky="nw", **pad)
        self.ctx_var = tk.StringVar(value="-")
        ttk.Label(ctx, textvariable=self.ctx_var, justify="left", width=44).grid(row=0, column=0, **pad)

        # volume pane
        vol = ttk.LabelFrame(top, text="Volume")
        vol.grid(row=2, column=0, sticky="nw", **pad)
        self.vol_var = tk.IntVar(value=0)
        self.vol_muted = tk.BooleanVar(value=False)
        self.vol_scale = ttk.Scale(vol, from_=0, to=60, variable=self.vol_var,
                                   command=self._on_slider, length=240)
        self.vol_scale.grid(row=0, column=0, columnspan=2, sticky="ew", **pad)
        self.vol_label = ttk.Label(vol, text="0")
        self.vol_label.grid(row=0, column=2, **pad)
        ttk.Checkbutton(vol, text="Mute", variable=self.vol_muted,
                        command=self._on_mute).grid(row=1, column=0, **pad)

        # remote pane
        rem = ttk.LabelFrame(top, text="Remote")
        rem.grid(row=0, column=1, rowspan=3, sticky="n", **pad)
        for label, row, col in REMOTE_KEYS:
            cmd = lambda l=label: self._send_key(l)  # noqa: E731
            ttk.Button(rem, text=label, width=12, command=cmd).grid(row=row, column=col, **pad)

        # status bar
        self.status_var = tk.StringVar(value="connecting...")
        ttk.Label(self.root, textvariable=self.status_var, relief="sunken",
                  anchor="w").pack(fill="both", **pad)

    # -- behaviour -----------------------------------------------------

    def _in_background(self, fn, on_done):
        def runner():
            try:
                result = fn()
                self.root.after(0, lambda: on_done(result))
            except Exception as exc:  # noqa: BLE001
                self.root.after(0, lambda: self.status_var.set(str(exc)))
        threading.Thread(target=runner, daemon=True).start()

    def _poll(self):
        self._in_background(
            lambda: (self.tv.volume(), self.tv.context()),
            self._apply_state)
        self.root.after(2000, self._poll)

    def _apply_state(self, result):
        vol, ctx = result
        if vol:
            self.vol_var.set(vol.get("current", 0))
            self.vol_muted.set(vol.get("muted", False))
            self.vol_label.config(text=f"{vol.get('current', 0)} / {vol.get('max', 60)}")
            self.vol_scale.configure(to=vol.get("max", 60))
        if ctx:
            parts = [f"{k}: {v}" for k, v in ctx.items() if v not in ("NA", None)]
            self.ctx_var.set("\n".join(parts) or "-")
        self.status_var.set("connected")

    def _load_info(self):
        self._in_background(
            lambda: self.tv.system(decrypt=True),
            lambda data: [self.info_vars[k].set(str(data.get(k, "-"))) for k in self.info_vars])

    def _on_slider(self, value):
        level = int(float(value))
        self.vol_label.config(text=str(level))
        self._in_background(lambda: self.tv.set_volume(level), lambda ok: None)

    def _on_mute(self):
        muted = self.vol_muted.get()
        self._in_background(lambda: self.tv.set_muted(muted), lambda ok: None)

    def _send_key(self, label):
        if label == "Mute":
            self.vol_muted.set(not self.vol_muted.get())
            self._on_mute()
            return
        if label == "VolumeUp":
            self.vol_var.set(min(self.vol_var.get() + 2, self.vol_scale.cget("to")))
            self._on_slider(self.vol_var.get())
            return
        if label == "VolumeDown":
            self.vol_var.set(max(self.vol_var.get() - 2, 0))
            self._on_slider(self.vol_var.get())
            return
        self.status_var.set(f"sending {label}...")
        self._in_background(lambda: self.tv.send_key(label),
                            lambda ok: self.status_var.set(f"{label}: {'ok' if ok else 'failed'}"))

    def run(self):
        self._load_info()
        self.root.mainloop()


def run(tv: PhilipsTV) -> None:
    try:
        TVGui(tv).run()
    except tk.TclError as exc:
        messagebox.showerror("philips-tv-rea", f"Cannot open display: {exc}")
