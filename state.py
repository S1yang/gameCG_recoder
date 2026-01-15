# state.py
import os, json, time
from typing import Optional

# Project base (where this file lives)
PROJECT_BASE = os.path.dirname(os.path.abspath(__file__))

# Game root can be overridden (e.g., games/onmyoji)
_GAME_ROOT = None  # type: Optional[str]

def set_game_root(game_root: str):
    """Set the active game root directory (absolute or relative to PROJECT_BASE)."""
    global _GAME_ROOT
    if not game_root:
        _GAME_ROOT = None
        return
    p = str(game_root).strip()
    if not os.path.isabs(p):
        p = os.path.abspath(os.path.join(PROJECT_BASE, p))
    _GAME_ROOT = p

def get_game_root() -> str:
    """Return current game root; defaults to PROJECT_BASE."""
    return _GAME_ROOT or PROJECT_BASE

def _progress_path() -> str:
    return os.path.join(get_game_root(), "progress.json")

def load_progress():
    path = _progress_path()
    if not os.path.exists(path):
        return {"tasks": {}}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"tasks": {}}
        data.setdefault("tasks", {})
        if not isinstance(data["tasks"], dict):
            data["tasks"] = {}
        return data
    except Exception:
        # 损坏/空文件等：兜底
        return {"tasks": {}}


def save_progress(prog: dict):
    path = _progress_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(prog, f, ensure_ascii=False, indent=2)

def get_task_state(prog: dict, sid: int) -> dict:
    return (prog.get("tasks", {}) or {}).get(f"{sid:03d}", {}) or {}

def set_task_state(prog: dict, sid: int, **kwargs):
    tasks = prog.setdefault("tasks", {})
    k = f"{sid:03d}"
    st = tasks.get(k, {}) or {}
    st.update(kwargs)
    st["ts"] = time.time()
    tasks[k] = st
    prog["tasks"] = tasks
    save_progress(prog)
