#!/usr/bin/env python3
"""tvctl - control TPV-built Philips Saphi TVs over JointSpace v6.

Usage:
  tvctl pair                      run the pairing wizard
  tvctl info                      show decrypted system info
  tvctl status                    volume + context snapshot
  tvctl probe                     list known endpoints and their HTTP status
  tvctl volume [0-MAX]            show or set volume
  tvctl mute                      toggle mute
  tvctl key <KEY>                 send a remote key (Standby, Home, Confirm, ...)
  tvctl keys                      list all known remote keys
  tvctl settings                  dump the settings-menu node tree
  tvctl channels                  list installed channel lists
  tvctl post <path> <json>        raw authenticated POST (advanced)
  tvctl gui                       launch the desktop GUI

Common keys: Standby Home Back Options Confirm VolumeUp VolumeDown Mute
             ArrowUp ArrowDown ArrowLeft ArrowRight PlayPause Stop
             FastForward Rewind Source Digit0-9
"""
import argparse
import json
import sys

from philips_tv.config import load, save
from philips_tv.pairing import pair
from philips_tv.transport import Credentials, JointSpaceTransport
from philips_tv.tv import PhilipsTV
from philips_tv import gui


def get_tv(require_creds: bool = True) -> PhilipsTV:
    cfg = load()
    if not cfg:
        print("No credentials found. Run: tvctl pair", file=sys.stderr)
        sys.exit(1)
    creds = Credentials(cfg["user"], cfg["password"])
    return PhilipsTV(cfg["host"], creds)


def cmd_pair(args):
    host = args.host or input("TV IP address: ").strip()
    transport = JointSpaceTransport(host)
    creds = pair(transport, device_name="philips-tv-rea")
    path = save(host, creds)
    print(f"Paired. Credentials saved to {path}")
    tv = PhilipsTV(host, creds)
    print("Verify:", json.dumps(tv.volume()))


def cmd_info(args):
    tv = get_tv()
    data = tv.system(decrypt=True)
    for key in ("name", "model", "serialnumber", "softwareversion", "country", "os_type"):
        print(f"{key:18} {data.get(key, '')}")
    api = data.get("api_version", {})
    if isinstance(api, dict):
        print(f"{'api_version':18} {api.get('Major', 0)}.{api.get('Minor', 0)}.{api.get('Patch', 0)}")


def cmd_status(args):
    tv = get_tv()
    print("volume:", json.dumps(tv.volume()))
    print("context:", json.dumps(tv.context()))


def cmd_probe(args):
    tv = get_tv()
    for path, code in tv.probe_endpoints().items():
        print(f"{path:40} {code}")


def cmd_volume(args):
    tv = get_tv()
    if args.level is None:
        print(json.dumps(tv.volume()))
    else:
        ok = tv.set_volume(args.level)
        print("OK" if ok else "FAILED")


def cmd_mute(args):
    tv = get_tv()
    cur = tv.volume()
    ok = tv.set_muted(not cur.get("muted", False))
    print("muted" if ok and not cur.get("muted") else "unmuted" if ok else "FAILED")


def cmd_key(args):
    tv = get_tv()
    ok = tv.send_key(args.key)
    print("OK" if ok else f"FAILED ({args.key})")


def cmd_keys(args):
    from philips_tv.tv import KNOWN_KEYS
    print("\n".join(KNOWN_KEYS))
    print("Standby  (works, but powers the TV off - use deliberately)")


def cmd_settings(args):
    tv = get_tv()
    print(json.dumps(tv.settings_tree(), indent=1))


def cmd_channels(args):
    tv = get_tv()
    print(json.dumps(tv.channel_lists(), indent=1))



def cmd_post(args):
    tv = get_tv()
    resp = tv.transport.post(args.path, json.loads(args.body))
    print(f"HTTP {resp.status}")
    print(resp.body)


def cmd_gui(args):
    tv = get_tv()
    gui.run(tv)


def main():
    parser = argparse.ArgumentParser(prog="tvctl", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("pair")
    p.add_argument("--host", help="TV IP (skips prompt)")
    p.set_defaults(fn=cmd_pair)

    sub.add_parser("info").set_defaults(fn=cmd_info)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    sub.add_parser("probe").set_defaults(fn=cmd_probe)

    p = sub.add_parser("volume")
    p.add_argument("level", nargs="?", type=int, default=None)
    p.set_defaults(fn=cmd_volume)

    sub.add_parser("mute").set_defaults(fn=cmd_mute)

    p = sub.add_parser("key")
    p.add_argument("key")
    p.set_defaults(fn=cmd_key)

    p = sub.add_parser("post")
    p.add_argument("path")
    p.add_argument("body")
    p.set_defaults(fn=cmd_post)

    sub.add_parser("gui").set_defaults(fn=cmd_gui)
    sub.add_parser("keys").set_defaults(fn=cmd_keys)
    sub.add_parser("settings").set_defaults(fn=cmd_settings)
    sub.add_parser("channels").set_defaults(fn=cmd_channels)

    args = parser.parse_args()
    try:
        args.fn(args)
    except KeyboardInterrupt:
        pass
    except ConnectionError as exc:
        print(f"Connection failed: {exc}", file=sys.stderr)
        print("If the TV just rejected a request, its daemon may be wedged - power-cycle it.", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
