# api/runtime.py
import atexit
import json
import os
import socket
import time
from typing import Optional, Dict, Any

RUNTIME_DIRNAME = ".galrec"
RUNTIME_FILENAME = "runtime.json"


def project_base_dir() -> str:
    # api/runtime.py -> project root
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def runtime_path(base_dir: Optional[str] = None) -> str:
    base = base_dir or project_base_dir()
    return os.path.join(base, RUNTIME_DIRNAME, RUNTIME_FILENAME)


def ensure_runtime_dir(base_dir: Optional[str] = None) -> str:
    base = base_dir or project_base_dir()
    d = os.path.join(base, RUNTIME_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


def find_free_port(host: str = "127.0.0.1") -> int:
    """
    Ask OS for a free port by binding port 0.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return int(s.getsockname()[1])


def write_runtime(api_base: str, pid: int, extra: Optional[Dict[str, Any]] = None, base_dir: Optional[str] = None) -> str:
    ensure_runtime_dir(base_dir)
    path = runtime_path(base_dir)
    payload: Dict[str, Any] = {
        "api_base": api_base,
        "pid": pid,
        "started_at": int(time.time()),
        "version": 1,
    }
    if extra:
        payload.update(extra)

    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return path


def remove_runtime(base_dir: Optional[str] = None) -> None:
    path = runtime_path(base_dir)
    try:
        if os.path.isfile(path):
            os.remove(path)
    except Exception:
        pass


def install_atexit_cleanup(base_dir: Optional[str] = None) -> None:
    atexit.register(remove_runtime, base_dir)
