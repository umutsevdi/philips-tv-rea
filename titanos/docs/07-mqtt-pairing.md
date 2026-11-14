# 07. MQTT second-screen pairing

All from main-CrBAgRaF.js [O].

- Broker: `wss://localhost.titanos.local:8083/`. The firmware runs a local
  MQTT broker, reachable only from the TV itself.
- Client: the `mqtt` JS library embedded in the bundle (protocol 3/4/5,
  `bridgeMode` version flag in the parser).
- Client id `launcher`, keepalive 30 s, `reconnectPeriod: 0`, connect timeout
  10 s.
- Topics: `titanos_launcher` (credentials storage key), `pairing/start`,
  `pairing/finish`, `pairing/cancel`, `channels/command` (prefix match).
- Pairing: the launcher publishes `pairing/cancel`, then `pairing/start` in a
  retry loop (first try 0–1 s jitter, then 1 s per 2 attempts + jitter, cap
  3 s). Aborts when the page is hidden. Waits for `{data:{challenge}}` and
  answers with an HMAC.
- Credentials: MQTT username/password stored under `MQTT_USER_NAME` as JSON
  `{username, password}`, removed on unpair.
- Commands: `channels/command` messages are parsed as JSON and drive e.g.
  channel tunes from a paired phone.
- State: `inactive` / `launcher` / `active` (active when subscribed to the
  channels prefix and paired). Reconnect timer about 61 s; WebSocket close
  codes 134/135 handled specially.

[I] This is how the Titan OS mobile app sends commands (deeplinks, channel
numbers) to the launcher. A replacement launcher must re-implement this
client or lose second-screen features.

Provenance: main-CrBAgRaF.js (broker URL `eV`, pairing loop `OV`, backoff
`fV`, credential helpers, command topic `JV`).
