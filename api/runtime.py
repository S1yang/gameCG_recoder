# api/runtime.py
import atexit
import json
import os
import socket
import time
from typing import Optional, Dict, Any

RUNTIME_DIRNAME = ".galrec"
RUNTIME_FILENAME = "runtime.json"


def _is_frozen() -> bool:
    return bool(getattr(__import__("sys"), "frozen", False))


def get_base_dir() -> str:
    """
    统一“工作根目录”：
    - dev: 项目根（api/ 的上一级）
    - packaged(Python exe): <galrec_api.exe 同级>/_internal

    也支持外部显式覆盖：
    - env GALREC_BASE_DIR
    """
    base = os.environ.get("GALREC_BASE_DIR")
    if base:
        return os.path.abspath(base)

    if _is_frozen():
        import sys
        app_dir = os.path.dirname(sys.executable)          # .../resources/backend/galrec_api
        return os.path.join(app_dir, "_internal")          # .../resources/backend/galrec_api/_internal

    # dev: api/runtime.py -> 项目根
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def runtime_path(base_dir: Optional[str] = None) -> str:
    base = base_dir or get_base_dir()
    return os.path.join(base, RUNTIME_DIRNAME, RUNTIME_FILENAME)


def ensure_runtime_dir(base_dir: Optional[str] = None) -> str:
    base = base_dir or get_base_dir()
    d = os.path.join(base, RUNTIME_DIRNAME)
    os.makedirs(d, exist_ok=True)
    return d


def find_free_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return int(s.getsockname()[1])


def write_runtime(
    api_base: str,
    pid: int,
    extra: Optional[Dict[str, Any]] = None,
    base_dir: Optional[str] = None,
) -> str:
    base = base_dir or get_base_dir()
    ensure_runtime_dir(base)
    path = runtime_path(base)
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
    base = base_dir or get_base_dir()
    path = runtime_path(base)
    try:
        if os.path.isfile(path):
            os.remove(path)
    except Exception:
        pass


def install_atexit_cleanup(base_dir: Optional[str] = None) -> None:
    base = base_dir or get_base_dir()
    atexit.register(remove_runtime, base)
