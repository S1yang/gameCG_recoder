# api/config.py
import os
import yaml
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

from game_registry import GameRegistry
from state import set_game_root

router = APIRouter(prefix="/config", tags=["config"])


# -------------------------
# Helpers
# -------------------------

def _active_root() -> str:
    root = GameRegistry(BASE_DIR).resolve_active_root()
    set_game_root(root)
    return root


def _config_path(root: str) -> str:
    # game-level config
    return os.path.join(root, "config.yaml")


def _default_template_path() -> str:
    # project-level default config template
    return os.path.join(BASE_DIR, ".galrec", "default_config.yaml")


def _read_yaml(path: str) -> Dict[str, Any]:
    if not os.path.isfile(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _write_yaml(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data or {}, f, allow_unicode=True, sort_keys=False)


def _merge_defaults(base: Dict[str, Any], defaults: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursive: fill missing keys only (never overwrite user-provided values).
    """
    if not isinstance(base, dict):
        base = {}
    out = dict(base)
    for k, v in (defaults or {}).items():
        if k not in out:
            out[k] = v
        else:
            if isinstance(v, dict) and isinstance(out.get(k), dict):
                out[k] = _merge_defaults(out[k], v)
    return out


def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any], overwrite: bool = False) -> Dict[str, Any]:
    """
    Merge src into dst.
    - overwrite=False: only fill missing keys (like defaults)
    - overwrite=True: replace existing keys
    """
    if not isinstance(dst, dict):
        dst = {}
    if not isinstance(src, dict):
        return dst
    out = dict(dst)
    for k, v in src.items():
        if k in out and isinstance(out.get(k), dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v, overwrite=overwrite)
        else:
            if overwrite or (k not in out):
                out[k] = v
    return out


def _normalize_legacy(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Backward-compat:
    - old schema may have game.window_title, map it to game_window_title if missing.
    """
    if not isinstance(cfg, dict):
        return {}
    out = dict(cfg)

    # legacy: { game: { window_title: ... } }
    if "game_window_title" not in out:
        g = out.get("game", {})
        if isinstance(g, dict):
            wt = (g.get("window_title") or "").strip()
            if wt:
                out["game_window_title"] = wt

    return out


def _runner_default_config() -> Dict[str, Any]:
    """
    Defaults aligned to runner.py (truth source).
    Keep it permissive: UI can expose more fields over time without breaking runner.
    """
    return {
        "version": 1,

        # ===== required =====
        "game_window_title": "",

        # ===== obs =====
        "obs": {
            "host": "127.0.0.1",
            "port": 4455,
            "password": "",
            "output_raw_dir": "",
            "output_final_dir": "",
        },

        # ===== ui =====
        "ui": {
            "step_delay_sec": 0.0,
            "step_delay_entry_after_click": 0.0,
            "step_delay_after_preplay": 0.0,

            "advance_click_rel_x": 0.50,
            "advance_click_rel_y": 0.90,

            "enter_scene_change_diff_thr": 10.0,
            "enter_scene_change_hits": 3,
            "enter_scene_change_timeout_sec": 2.0,
            "enter_double_click": True,

            "click_interval_sec": 0.35,
            "countdown_sec": 3,

            "disable_failsafe": False,
            "stop_on_fail": False,
        },

        # ===== vision =====
        "vision": {
            "enter_template_thr": 0.80,
            "action_template_thr": 0.80,

            "enter_retries": 10,
            "action_retries": 10,
            "retry_sleep_sec": 0.25,
        },

        # ===== end detection =====
        "end_detection": {
            "end_template_thr": 0.86,
            "end_hits_need": 3,

            "return_diff_thr": 6.0,
            "return_hits_need": 6,

            "min_play_sec": 2.0,
            "check_every_steps": 1,
        },

        # ===== play =====
        "play": {
            "max_steps": 2000,
            "pacing_system_sec": 0.35,
            "jitter_sec": 0.0,
        },

        # ===== audio =====
        "audio": {
            "enabled": True,
        },
    }


def _strip_game_specific(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strip game-specific fields so default template is reusable across games.
    """
    if not isinstance(cfg, dict):
        return {}
    out = dict(cfg)
    out["game_window_title"] = ""
    # also strip legacy nested field if present
    if isinstance(out.get("game"), dict):
        out["game"] = dict(out["game"])
        out["game"]["window_title"] = ""
    return out


# -------------------------
# Models
# -------------------------

class PutConfigReq(BaseModel):
    config: Dict[str, Any]


class PutDefaultTemplateReq(BaseModel):
    config: Dict[str, Any]
    strip_game_specific: bool = True


class ApplyDefaultReq(BaseModel):
    mode: str = "merge"  # "merge" | "replace"


# -------------------------
# Routes
# -------------------------

@router.get("")
def get_config():
    root = _active_root()
    path = _config_path(root)
    cfg = _read_yaml(path)
    cfg = _normalize_legacy(cfg)
    cfg = _merge_defaults(cfg, _runner_default_config())
    return {"root": root, "config_path": path, "config": cfg}


@router.put("")
def put_config(req: PutConfigReq):
    """
    保存 Config，并同步 game_window_title 到 Registry。
    """
    root = _active_root()
    path = _config_path(root)

    if not isinstance(req.config, dict):
        raise HTTPException(400, "config must be a dict")

    cfg = _normalize_legacy(req.config)
    _write_yaml(path, cfg)

    # return merged view
    cfg2 = _normalize_legacy(_read_yaml(path))
    # 注意：这里需要 _runner_default_config，请确保它在作用域内

    cfg2 = _merge_defaults(cfg2, _runner_default_config())

    # ✅【新增】同步回 Registry
    new_title = cfg.get("game_window_title")
    if new_title:
        try:
            reg = GameRegistry(BASE_DIR)
            active_key = reg.get_active_key()
            if active_key:
                # 获取当前 registry 中的信息，保留 root 和 title，只更新 window_title
                games = reg.list_games()
                if active_key in games:
                    g = games[active_key]
                    reg.upsert_game(
                        key=active_key,
                        root=g.root,
                        title=g.title,
                        window_title=str(new_title)
                    )
        except Exception as e:
            print(f"[Warn] Failed to sync registry window_title: {e}")

    return {"ok": True, "config": cfg2}


@router.get("/default_template")
def get_default_template():
    path = _default_template_path()
    cfg = _read_yaml(path)
    cfg = _normalize_legacy(cfg)
    cfg = _merge_defaults(cfg, _runner_default_config())
    return {"path": path, "exists": os.path.isfile(path), "config": cfg}


@router.put("/default_template")
def put_default_template(req: PutDefaultTemplateReq):
    path = _default_template_path()
    if not isinstance(req.config, dict):
        raise HTTPException(400, "config must be a dict")

    cfg = _normalize_legacy(req.config)
    if req.strip_game_specific:
        cfg = _strip_game_specific(cfg)

    _write_yaml(path, cfg)

    cfg2 = _normalize_legacy(_read_yaml(path))
    cfg2 = _merge_defaults(cfg2, _runner_default_config())
    return {"ok": True, "path": path, "config": cfg2}


@router.post("/apply_default")
def apply_default(req: ApplyDefaultReq):
    """
    Apply project-level default template to current active game's config.
    - mode=merge: fill missing keys, keep existing values; always preserve game_window_title
    - mode=replace: overwrite with default template; preserve existing game_window_title if non-empty
    """
    mode = (req.mode or "merge").strip().lower()
    if mode not in ("merge", "replace"):
        raise HTTPException(400, "mode must be 'merge' or 'replace'")

    root = _active_root()
    cpath = _config_path(root)

    cur = _normalize_legacy(_read_yaml(cpath))
    cur = _merge_defaults(cur, _runner_default_config())

    default_path = _default_template_path()
    tpl = _normalize_legacy(_read_yaml(default_path))
    tpl = _merge_defaults(tpl, _runner_default_config())

    cur_title = (cur.get("game_window_title") or "").strip()

    if mode == "merge":
        # fill missing keys only
        merged = _deep_merge(cur, tpl, overwrite=False)
        merged["game_window_title"] = cur_title  # preserve
    else:
        # replace, but keep title if user already has one
        merged = dict(tpl)
        if cur_title:
            merged["game_window_title"] = cur_title

    _write_yaml(cpath, merged)
    return {"ok": True, "mode": mode, "config": merged, "config_path": cpath}
