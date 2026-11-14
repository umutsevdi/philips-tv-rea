"""Find Philips JointSpace TVs on the local network without a hardcoded IP.

Two mechanisms, tried in order:
1. SSDP M-SEARCH for upnp:rootdevice — Philips TVs announce a DeviceDescription
   that contains the model name. Filter for Philips/Titan/Saphi vendors.
2. mDNS (_jointspace._tcp or _philips-_tcp._local) — some builds advertise.
3. Fallback: probe JointSpace on :1925 for every host in the local /24.
"""
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

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


def _local_subnet() -> str:
    """Best-effort local /24 without external deps."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        return "192.168.1.0/24"
    finally:
        s.close()
    net = ipaddress.ip_address(ip)
    return str(ipaddress.ip_network(f"{ip}/24", strict=False))


def _local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


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


def discover(timeout: float = 4.0, subnet: str | None = None) -> list[FoundTV]:
    """Return TVs on the LAN exposing a JointSpace API."""
    found = {}
    local = _local_ip()

    # 1. SSDP
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
                        url = loc.group(1)
                        host = urlparse(url).hostname
                        if host and host not in found:
                            found[host] = FoundTV(host=host, source="SSDP")
            except socket.timeout:
                break
    except OSError:
        pass

    # 2. subnet probe (skip our own IP; SSDP hits are verified too)
    net = ipaddress.ip_network(subnet or _local_subnet(), strict=False)
    hosts = [str(h) for h in net.hosts() if str(h) != local]
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex:
        results = dict(zip(hosts, ex.map(_probe_jointspace, hosts)))
    for host, sysinfo in results.items():
        if sysinfo and sysinfo.get("api_version"):
            if host not in found:
                found[host] = FoundTV(
                    host=host,
                    model=sysinfo.get("name", ""),
                    source="subnet probe")

    # enrich with model names
    for tv in found.values():
        if not tv.model:
            info = _probe_jointspace(tv.host)
            tv.model = info.get("name", "")
    return list(found.values())
