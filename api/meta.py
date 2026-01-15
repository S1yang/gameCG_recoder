# api/meta.py
import os
import glob
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import APIRouter, HTTPException

from game_registry import GameRegistry
from state import set_game_root

router = APIRouter(prefix="/meta", tags=["meta"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _active_root_and_key() -> Dict[str, str]:
    reg = GameRegistry(BASE_DIR)
    key = reg.get_active_key()
    if not key:
        raise HTTPException(400, "registry.active is empty. Please set an active game.")
    root = reg.resolve_active_root()
    set_game_root(root)
    return {"active_key": key, "game_root": root}


def _mtime(path: str) -> Optional[int]:
    try:
        return int(os.path.getmtime(path))
    except Exception:
        return None


def _iso(ts: Optional[int]) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts).isoformat(timespec="seconds")
    except Exception:
        return None


@router.get("/active")
def meta_active() -> Dict[str, Any]:
    """
    返回 active game 的概览信息：根目录、关键文件路径、数量、mtime 等。
    """
    info = _active_root_and_key()
    root = info["game_root"]

    seq_dir = os.path.join(root, "sequences")
    tpl_dir = os.path.join(root, "templates")
    cfg_path = os.path.join(root, "config.yaml")
    queue_path = os.path.join(root, "queue.yaml")

    # counts
    seq_count = 0
    if os.path.isdir(seq_dir):
        seq_count = len(
            [p for p in glob.glob(os.path.join(seq_dir, "*.y*ml")) if os.path.isfile(p)]
        )

    tpl_count = 0
    if os.path.isdir(tpl_dir):
        tpl_count = len([p for p in glob.glob(os.path.join(tpl_dir, "*")) if os.path.isfile(p)])

    # mtime
    cfg_m = _mtime(cfg_path)
    queue_m = _mtime(queue_path)
    seq_m = _mtime(seq_dir) if os.path.isdir(seq_dir) else None
    tpl_m = _mtime(tpl_dir) if os.path.isdir(tpl_dir) else None
    root_m = _mtime(root)

    return {
        "active": info["active_key"],
        "game_root": root,
        "paths": {
            "seq_dir": seq_dir,
            "tpl_dir": tpl_dir,
            "config_path": cfg_path,
            "queue_path": queue_path,
        },
        "counts": {
            "sequences": seq_count,
            "templates": tpl_count,
        },
        "mtime": {
            "root": root_m,
            "root_iso": _iso(root_m),
            "config": cfg_m,
            "config_iso": _iso(cfg_m),
            "queue": queue_m,
            "queue_iso": _iso(queue_m),
            "sequences_dir": seq_m,
            "sequences_dir_iso": _iso(seq_m),
            "templates_dir": tpl_m,
            "templates_dir_iso": _iso(tpl_m),
        },
    }
