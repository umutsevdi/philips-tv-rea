# philips-tv-rea

Reverse engineering a Philips TV, split in two parts:

1. **Firmware API** (this repo). The JointSpace interface on port 1926:
   pairing, key sending, volume, decrypted system info. Shipped as a working
   Python app with a GUI console and a scriptable CLI.
2. **TV launcher** ([`titanos/app/`](titanos/app/)): a single SvelteKit
   app on a Raspberry Pi that replaces the Titan OS home screen — app
   tiles, live TV, a Nextcloud Drive browser — with no ads and no on-TV typing.
   Research notes on the stock launcher live in [`titanos/docs/`](titanos/docs/).

Both target the same hardware: a **Philips 40PFS6000/62** (TPV-made, Saphi
Linux, JointSpace 6.1, Titan OS launcher). Most TPV-built Philips TVs should
behave the same.

## Quick start (firmware app)

```bash
git clone https://github.com/umutsevdi/philips-tv-rea.git
cd philips-tv-rea
python3 tvctl.py gui
```

The app finds your TV on the network, pairs with a PIN shown on the TV
screen, and saves the credentials. After that:

- **GUI**: TV info, context, volume, full remote (numpad, D-pad, colour
  keys), and a log of every request to the TV.
- **Keyboard**: arrows navigate the TV, Enter confirms, digits change
  channels, `h` home, `m` mute, `+`/`−` volume, `p` standby.
- **CLI** (same commands, no window):

```bash
python3 tvctl.py info            # name, model, serial, firmware
python3 tvctl.py status          # volume + context
python3 tvctl.py key CursorRight # move focus on the home screen
python3 tvctl.py volume 25       # set volume
```

Requirements: Python 3.9+ and `openssl`. No packages to install.

## Quick start (TV launcher)

```bash
cd titanos/app
npm install
npm run build

# One config file for the whole app (mode 0600):
mkdir -p ~/.config/philips-tv-rea
cat > ~/.config/philips-tv-rea/config.json <<'EOF'
{
  "nextcloud": { "base": "https://your.cloud.example",
                 "user": "you", "app_password": "APP-PW" }
}
EOF
chmod 600 ~/.config/philips-tv-rea/config.json

node build
```

Desktop development: `npm run dev` (mock TV + demo content on the laptop
only — the TV build renders real data exclusively).

On the TV: open the browser app → `http://<pi-ip>:8080`, then open `/pair`
from a laptop browser to pair with the TV API (type the TV's PIN there,
never on the TV). Bookmark the launcher on the TV.

## Debloating

The home screen loads from `app.titanos.tv`. Block that domain in any DNS
filter (Pi-hole, AdGuard Home, NextDNS) and the sponsored banners disappear.
Live TV, HDMI inputs and streaming apps are unaffected. The
[ads and tracking doc](titanos/docs/05-ads-and-tracking.md) lists every ad
source and tracker endpoint the launcher contacts.

## Documentation

Research notes on the stock Titan OS launcher (architecture, firmware API,
launch model, backend auth, ads, device identity, MQTT, open questions)
are numbered by topic in [`titanos/docs/`](titanos/docs/). Firmware protocol
details live in [AGENTS.md](AGENTS.md).

## Troubleshooting

- **Every command fails**: the TV's API service crashed. Unplug the TV at
  the wall for 30 seconds. Standby does not fix it. The GUI tells you when
  this happens.
- **Pairing says CONCURRENT_PAIRING**: wait 40 seconds, retry.
- **Discovery finds nothing**: your Wi-Fi may isolate clients. Use
  `python3 tvctl.py pair --host <TV IP>`.

## Credits

- [`ha-philipsjs`](https://github.com/danielperna84/ha-philipsjs) (Home
  Assistant): shared AES key and pairing shape.
- [hagezi's DNS blocklists](https://github.com/hagezi/dns-blocklists):
  TV/telemetry lists that complement the Titan OS block.
- [jointspace.tv](https://jointspace.tv): remnants of the original
  JointSpace docs.

## License
MIT: see [LICENSE](LICENSE).

---

_Assisted by [imza](https://imza.run)._
