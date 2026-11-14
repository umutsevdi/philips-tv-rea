"""Find Philips JointSpace TVs on the local network without a hardcoded IP.

Mechanisms, tried in order:

1. mDNS — Philips TVs announce `_philipstv_s_rpc._tcp.local` with the model
   name in the instance label and the JointSpace port (1926) in the SRV
   record. Cleanest source: no traffic to the TV needed.
2. SSDP M-SEARCH — older announcement path, filtered for Philips/TPV/Titan.
3. Subnet probe — GET http://host:1925/6/system for every host in the /24.
   Slow but finds TVs that disable multicast announcements.

Uses only the standard library (mDNS via a minimal multicast socket —
no zeroconf dependency).
"""
import concurrent.futures
import ipaddress
import re
import socket
import struct
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse

MDNS_GROUP = "224.0.0.251"
MDNS_PORT = 5353
MDNS_QUERY = "_philipstv._tcp.local"
SSDP_ADDR = "239.255.255.250"
SSDP_PORT = 1900
SSDP_MSG = (
    "M-SEARCH * HTTP/1.1\r\n"
    "HOST: 239.255.255.250:1900\r\n"
    'MAN: "ssdp:discover"\r\n'
    "MX: 3\r\n"
    "ST: upnp:rootdevice\r\n\r\n"
)


@dataclass
class FoundTV:
    host: str
    model: str = ""
    source: str = ""


def _local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


def _local_subnet() -> str:
    ip = _local_ip()
    if not ip:
        return "192.168.1.0/24"
    return str(ipaddress.ip_network(f"{ip}/24", strict=False))


def _probe_jointspace(host: str, timeout: float = 1.5) -> dict:
    """GET http://host:1925/6/system, return parsed JSON or {}."""
    import http.client
    import json
    try:
        conn = http.client.HTTPConnection(host, 1925, timeout=timeout)
        conn.request("GET", "/6/system")
        r = conn.getresponse()
        data = r.read().decode(errors="replace")
        conn.close()
        if r.status == 200:
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return {}
    except OSError:
        pass
    return {}


def _decode_mdns_name(data: bytes, offset: int) -> tuple[str, int]:
    """Decode a DNS name (handles compression pointers); return (name, next_offset)."""
    labels = []
    jumped = False
    next_off = offset
    seen = set()
    while True:
        if offset in seen:
            break
        seen.add(offset)
        length = data[offset]
        if length == 0:
            if not jumped:
                next_off = offset + 1
            break
        if length & 0xC0 == 0xC0:  # compression pointer
            pointer = ((length & 0x3F) << 8) | data[offset + 1]
            if not jumped:
                next_off = offset + 2
            offset = pointer
            jumped = True
            continue
        labels.append(data[offset + 1:offset + 1 + length].decode(errors="replace"))
        offset += 1 + length
    return ".".join(labels), next_off


def discover_mdns(timeout: float = 4.0) -> dict[str, FoundTV]:
    """Listen for Philips TV mDNS announcements; return host -> FoundTV."""
    found: dict[str, FoundTV] = {}
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except (AttributeError, OSError):
            pass
        sock.bind(("", MDNS_PORT))

        # join multicast group on all interfaces
        mreq = socket.inet_aton(MDNS_GROUP) + socket.inet_aton(_local_ip() or "0.0.0.0")
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        sock.settimeout(timeout)

        # send an mDNS query for the Philips service to provoke an answer
        qname = MDNS_QUERY.encode()
        query = b"\x00\x01" + b"\x00\x00\x00\x00\x00\x00" + \
            struct.pack(">H", len(qname)) + qname + b"\x00" + \
            struct.pack(">HH", 12, 1)  # PTR, IN
        try:
            sock.sendto(query, (MDNS_GROUP, MDNS_PORT))
        except OSError:
            pass

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                data, addr = sock.recvfrom(9000)
            except socket.timeout:
                break
            if addr[0] == _local_ip():
                continue
            text = data.decode(errors="replace")
            if "_philipstv" not in text:
                continue
            # find the A record (host address) for the TV
            # simple approach: the responding host IS the TV
            host = addr[0]
            # try to extract a model name from the payload
            model = ""
            m = re.search(r"(\d{2}[A-Z]{2}\w*/\d{2})", text)
            if m:
                model = m.group(1)
            found[host] = FoundTV(host=host, model=model, source="mDNS")
    except OSError:
        pass
    return found


def discover_ssdp(timeout: float = 4.0) -> dict[str, FoundTV]:
    found: dict[str, FoundTV] = {}
    try:
        ssdp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        ssdp.settimeout(timeout)
        ssdp.sendto(SSDP_MSG.encode(), (SSDP_ADDR, SSDP_PORT))
        while True:
            try:
                data, addr = ssdp.recvfrom(4096)
                text = data.decode(errors="replace")
                if "Philips" in text or "TPV" in text or "Titan" in text:
                    loc = re.search(r"LOCATION: (\S+)", text, re.I)
                    if loc:
                        host = urlparse(loc.group(1)).hostname
                        if host and host not in found:
                            found[host] = FoundTV(host=host, source="SSDP")
            except socket.timeout:
                break
    except OSError:
        pass
    return found


def discover(timeout: float = 4.0, subnet: str | None = None,
             methods: str = "probe+mdns+ssdp") -> list[FoundTV]:
    """Return TVs on the LAN exposing a JointSpace API."""
    found: dict[str, FoundTV] = {}

    def merge(new_tvs: dict[str, FoundTV]):
        for host, tv in new_tvs.items():
            if host not in found:
                found[host] = tv

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        futures = {}
        if "probe" in methods:
            def run_probe():
                local = _local_ip()
                net = ipaddress.ip_network(subnet or _local_subnet(), strict=False)
                hosts = [str(h) for h in net.hosts() if str(h) != local]
                out = {}
                with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex2:
                    results = dict(zip(hosts, ex2.map(_probe_jointspace, hosts)))
                for host, sysinfo in results.items():
                    if sysinfo and sysinfo.get("api_version"):
                        out[host] = FoundTV(host=host,
                                            model=sysinfo.get("name", ""),
                                            source="subnet probe")
                return out
            futures["probe"] = ex.submit(run_probe)
        if "mdns" in methods:
            futures["mdns"] = ex.submit(discover_mdns, min(timeout, 2.0))
        if "ssdp" in methods:
            futures["ssdp"] = ex.submit(discover_ssdp, timeout)
        for name, fut in futures.items():
            try:
                merge(fut.result())
            except Exception:  # noqa: BLE001 - one method failing must not kill discovery
                pass

    # fill in missing model names
    for tv in found.values():
        if not tv.model:
            info = _probe_jointspace(tv.host)
            tv.model = info.get("name", "")
    return list(found.values())
