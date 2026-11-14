"""Persist credentials outside the repo (never commit TV credentials)."""
import json
import os
import stat
from pathlib import Path
from typing import Optional

from .transport import Credentials

CONFIG_DIR = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "philips-tv-rea"
CONFIG_FILE = CONFIG_DIR / "credentials.json"


def load() -> Optional[dict]:
    if not CONFIG_FILE.exists():
        return None
    return json.loads(CONFIG_FILE.read_text())


def save(host: str, credentials) -> Path:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    path = CONFIG_FILE
    path.write_text(json.dumps({
        "host": host,
        "user": credentials.user,
        "password": credentials.password,
    }, indent=2))
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600
    return path
