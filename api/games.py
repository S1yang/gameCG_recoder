# api/games.py
import os
import re
import sys
import shutil
import subprocess
from typing import Optional, Dict, Any, List

import yaml
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from game_registry import GameRegistry  # noqa: E402

router = APIRouter(prefix="/games", tags=["games"])

# ✅ 项目根目录（api/ 的上一级）
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GAMES_DIR = os.path.join(BASE_DIR, "games")


# -------------------------
# Request models
# -------------------------

class SetActiveReq(BaseModel):
    key: str


class OpenGameReq(BaseModel):
    key: Optional[str] = None
    reveal: bool = False  # Windows 可用；目录 reveal 意义不大，但保留接口一致性


class UpsertGameReq(BaseModel):
    """
    新建 / 更新一个 game profile（写入 registry.yaml）。
    - root 可省略：默认使用 games/<key>
    - create_dirs: True 时会创建磁盘目录结构
    - set_active: True 时设为 active
    """
    key: str = Field(..., min_length=1)
    root: Optional[str] = None  # relative path stored in registry.yaml
    title: str = ""
    window_title: str = ""
    create_dirs: bool = True
    set_active: bool = True


class ImportReq(BaseModel):
    """
    从 games/<folder> 导入为 registry 记录（恢复/重建 registry）
    """
    folder: str = Field(..., min_length=1)  # folder name under games/
    key: Optional[str] = None
    title: str = ""
    window_title: str = ""
    set_active: bool = False


# -------------------------
# Helpers
# -------------------------

def _open_folder(path: str, reveal: bool = False):
    path = os.path.abspath(path)
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    if sys.platform.startswith("win"):
        if reveal:
            subprocess.Popen(["explorer", "/select,", path])
        else:
            subprocess.Popen(["explorer", path])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])


def _registry() -> GameRegistry:
    return GameRegistry(base_dir=BASE_DIR)


def _serialize_games(reg: GameRegistry) -> List[Dict[str, Any]]:
    active = reg.get_active_key()
    games = reg.list_games()
    out = []
    for k, p in games.items():
        out.append({
            "key": p.key,
            "root": p.root,  # 相对路径（registry.yaml 原值）
            "title": p.title,
            "window_title": p.window_title,
            "is_active": (k == active),
        })
    out.sort(key=lambda x: (0 if x["is_active"] else 1, x["key"]))
    return out


def _safe_key(s: str) -> str:
    """
    key 用于 registry 的索引名，建议简单安全。
    允许：字母数字 _ - .
    """
    s = (s or "").strip()
    if not s:
        raise ValueError("key cannot be empty")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", s):
        raise ValueError("key contains invalid chars (allowed: A-Z a-z 0-9 _ . -)")
    return s


def _safe_folder_name(s: str) -> str:
    """
    folder 只能是 games/ 下的单层目录名，禁止路径穿越。
    """
    s = os.path.basename((s or "").strip())
    if not s:
        raise ValueError("folder cannot be empty")
    if s in (".", ".."):
        raise ValueError("invalid folder")
    # 不强制字符集，但禁止任何路径分隔符
    if "/" in s or "\\" in s:
        raise ValueError("folder must be a single directory name")
    return s


def _ensure_game_dirs(abs_root: str) -> Dict[str, str]:
    """
    创建最小目录结构：sequences/ templates/
    """
    abs_root = os.path.abspath(abs_root)
    os.makedirs(abs_root, exist_ok=True)

    seq_dir = os.path.join(abs_root, "sequences")
    tpl_dir = os.path.join(abs_root, "templates")
    os.makedirs(seq_dir, exist_ok=True)
    os.makedirs(tpl_dir, exist_ok=True)

    return {"root": abs_root, "sequences": seq_dir, "templates": tpl_dir}


def _read_yaml(path: str) -> Dict[str, Any]:
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _infer_from_config(abs_root: str) -> Dict[str, str]:
    """
    尝试从 config.yaml / game.yaml 推断 window_title/title
    """
    cfg = _read_yaml(os.path.join(abs_root, "config.yaml"))
    game = cfg.get("game", {}) if isinstance(cfg.get("game"), dict) else {}
    # 兼容你旧字段/runner字段
    wt = ""
    if isinstance(cfg.get("game_window_title"), str):
        wt = cfg.get("game_window_title", "").strip()
    if not wt and isinstance(game.get("window_title"), str):
        wt = game.get("window_title", "").strip()

    title = ""
    if isinstance(game.get("title"), str):
        title = game.get("title", "").strip()

    return {"window_title": wt, "title": title}


def _is_import_candidate(abs_root: str) -> Dict[str, bool]:
    """
    判断一个目录是否“像一个 game 工程”
    """
    has_config = os.path.isfile(os.path.join(abs_root, "config.yaml")) or os.path.isfile(os.path.join(abs_root, "game.yaml"))
    has_sequences = os.path.isdir(os.path.join(abs_root, "sequences"))
    has_templates = os.path.isdir(os.path.join(abs_root, "templates"))
    return {
        "has_config": bool(has_config),
        "has_sequences": bool(has_sequences),
        "has_templates": bool(has_templates),
    }


def _rel_root_for_key(key: str) -> str:
    return os.path.join("games", key).replace("\\", "/")


# -------------------------
# Routes
# -------------------------

@router.get("")
def get_games():
    reg = _registry()
    return {
        "version": reg.data.get("version", 1),
        "active": reg.get_active_key(),
        "games": _serialize_games(reg),
    }


@router.post("/active")
def set_active(req: SetActiveReq):
    reg = _registry()
    try:
        reg.set_active(req.key)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"game not found: {req.key}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to set active: {e}")

    return {"ok": True, "active": reg.get_active_key(), "games": _serialize_games(reg)}


@router.post("/open")
def open_game(req: OpenGameReq):
    reg = _registry()
    key = (req.key or "").strip()
    try:
        if key:
            path = reg.resolve_root(key)
        else:
            path = reg.resolve_active_root()

        _open_folder(path, reveal=req.reveal)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"game not found: {key}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"folder not found: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to open folder: {e}")

    return {"ok": True, "key": (key or reg.get_active_key()), "path": os.path.abspath(path)}


@router.post("")
def upsert_game(req: UpsertGameReq):
    """
    新建/更新 registry 记录（并可自动创建目录结构）。
    ✅【新增】反向同步：如果 Config 文件存在，把 Registry 里的 window_title 写进去。
    """
    reg = GameRegistry(BASE_DIR) # 使用局部 import 或 helper

    try:
        # 这里为了安全，可以重新引入 _safe_key
        s = (req.key or "").strip()
        if not s or not re.fullmatch(r"[A-Za-z0-9_.-]+", s):
            raise ValueError("invalid key")
        key = s
    except Exception as e:
        raise HTTPException(400, str(e))

    root = (req.root or "").strip()
    if not root:
        root = os.path.join("games", key).replace("\\", "/") # _rel_root_for_key logic

    root = root.replace("\\", "/").strip()
    if os.path.isabs(root):
        raise HTTPException(400, "root must be a relative path")

    abs_root = os.path.abspath(os.path.join(BASE_DIR, root))
    if os.path.commonpath([abs_root, BASE_DIR]) != BASE_DIR:
        raise HTTPException(400, "root must be under project base_dir")

    if req.create_dirs:
        os.makedirs(abs_root, exist_ok=True)
        os.makedirs(os.path.join(abs_root, "sequences"), exist_ok=True)
        os.makedirs(os.path.join(abs_root, "templates"), exist_ok=True)
        os.makedirs(os.path.join(abs_root, "output"), exist_ok=True)

    try:
        reg.upsert_game(key=key, root=root, title=req.title or "", window_title=req.window_title or "")
        if req.set_active:
            reg.set_active(key)
    except Exception as e:
        raise HTTPException(500, f"failed to upsert game: {e}")

    # ✅ 同步到 Config 文件
    if req.window_title:
        cfg_path = os.path.join(abs_root, "config.yaml")
        # 兼容旧的 game.yaml
        game_yaml_path = os.path.join(abs_root, "game.yaml")
        target_cfg = game_yaml_path if os.path.exists(game_yaml_path) else cfg_path
        
        # 只有文件存在时才更新（不自动创建 config，避免覆盖默认逻辑）
        if os.path.exists(target_cfg):
            try:
                with open(target_cfg, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                
                # 只有当不一样时才写回
                current_val = data.get("game_window_title")
                # 也要检查 legacy 字段
                if not current_val and isinstance(data.get("game"), dict):
                    current_val = data["game"].get("window_title")

                if current_val != req.window_title:
                    data["game_window_title"] = req.window_title
                    with open(target_cfg, "w", encoding="utf-8") as f:
                        yaml.dump(data, f, allow_unicode=True, sort_keys=False)
            except Exception as e:
                print(f"[Warn] Failed to sync config game_window_title: {e}")

    return {"ok": True, "active": reg.get_active_key(), "games": _serialize_games(reg)}

@router.delete("/{key}")
def delete_game(
    key: str,
    purge: bool = Query(False, description="purge=true will also delete the game folder on disk"),
):
    """
    删除 game 记录：
    - purge=false（默认）：只删 registry 记录（磁盘目录保留，可 Import 恢复）
    - purge=true：删除磁盘目录 + 删 registry（危险操作，前端要二次确认）
    """
    reg = _registry()
    key = (key or "").strip()
    if not key:
        raise HTTPException(400, "empty key")

    # 先解析路径（即使 registry 删除了，purge 也需要路径）
    abs_root = None
    try:
        abs_root = reg.resolve_root(key)
    except Exception:
        abs_root = None

    try:
        reg.delete_game(key)
    except Exception as e:
        raise HTTPException(500, f"failed to delete registry record: {e}")

    if purge:
        if not abs_root:
            # registry 里没有这个 key，或 root 为空：已删 registry，但无法 purge
            raise HTTPException(404, f"cannot purge: game folder not resolved for key={key}")

        # 保护：只能删 BASE_DIR/games 下的目录
        abs_root = os.path.abspath(abs_root)
        games_dir = os.path.abspath(GAMES_DIR)
        if os.path.commonpath([abs_root, games_dir]) != games_dir:
            raise HTTPException(400, "refuse to purge: folder is not under project games/")

        if os.path.exists(abs_root):
            try:
                shutil.rmtree(abs_root)
            except Exception as e:
                raise HTTPException(500, f"registry deleted but failed to purge folder: {e}")

    return {"ok": True, "active": reg.get_active_key(), "games": _serialize_games(reg)}


@router.get("/import/candidates")
def import_candidates():
    """
    扫描 games/ 下的目录，列出 registry 没记录的“孤儿目录”
    """
    reg = _registry()
    known = set(reg.list_games().keys())

    games_dir = os.path.abspath(GAMES_DIR)
    os.makedirs(games_dir, exist_ok=True)

    out = []
    for name in os.listdir(games_dir):
        p = os.path.join(games_dir, name)
        if not os.path.isdir(p):
            continue

        # folder -> 默认 key 建议值
        folder = name
        if folder in known:
            continue

        meta = _is_import_candidate(p)
        # 至少满足一个特征才展示
        if not (meta["has_config"] or meta["has_sequences"] or meta["has_templates"]):
            continue

        inferred = _infer_from_config(p)
        out.append({
            "folder": folder,
            "root": os.path.join("games", folder).replace("\\", "/"),
            **meta,
            "suggest": {
                "key": folder,
                "title": inferred.get("title") or folder,
                "window_title": inferred.get("window_title") or "",
            }
        })

    out.sort(key=lambda x: x["folder"])
    return {"candidates": out}


@router.post("/import")
def import_game(req: ImportReq):
    """
    把 games/<folder> 目录导入 registry（恢复记录）。
    """
    reg = _registry()

    try:
        folder = _safe_folder_name(req.folder)
    except Exception as e:
        raise HTTPException(400, str(e))

    abs_root = os.path.abspath(os.path.join(GAMES_DIR, folder))
    if not os.path.isdir(abs_root):
        raise HTTPException(404, f"folder not found: games/{folder}")

    meta = _is_import_candidate(abs_root)
    if not (meta["has_config"] or meta["has_sequences"] or meta["has_templates"]):
        raise HTTPException(400, "folder does not look like a game project (missing config/sequences/templates)")

    # key：默认用 folder
    key = (req.key or folder).strip()
    try:
        key = _safe_key(key)
    except Exception as e:
        raise HTTPException(400, str(e))

    root_rel = os.path.join("games", folder).replace("\\", "/")

    inferred = _infer_from_config(abs_root)
    title = (req.title or "").strip() or inferred.get("title") or folder
    window_title = (req.window_title or "").strip() or inferred.get("window_title") or ""

    try:
        reg.upsert_game(key=key, root=root_rel, title=title, window_title=window_title)
        if req.set_active:
            reg.set_active(key)
    except Exception as e:
        raise HTTPException(500, f"failed to import game: {e}")

    return {"ok": True, "active": reg.get_active_key(), "games": _serialize_games(reg)}
