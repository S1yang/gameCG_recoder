# api/batch.py
import os
import glob
import yaml
from typing import Any, Dict, List, Optional, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

from game_registry import GameRegistry
from state import set_game_root, load_progress, save_progress

router = APIRouter(prefix="/batch", tags=["batch"])


def _active_root() -> str:
    root = GameRegistry(BASE_DIR).resolve_active_root()
    set_game_root(root)
    return root


def _seq_dir(root: str) -> str:
    p = os.path.join(root, "sequences")
    os.makedirs(p, exist_ok=True)
    return p


def _tpl_dir(root: str) -> str:
    p = os.path.join(root, "templates")
    os.makedirs(p, exist_ok=True)
    return p


def _seq_file(root: str, sid: int) -> str:
    return os.path.join(_seq_dir(root), f"{sid:03d}.yaml")


def _queue_path(root: str) -> str:
    return os.path.join(root, "queue.yaml")


def _load_queue(root: str) -> List[int]:
    qp = _queue_path(root)
    if not os.path.exists(qp):
        return []
    try:
        with open(qp, "r", encoding="utf-8") as f:
            q = yaml.safe_load(f) or {}
        order = q.get("order", [])
        if not isinstance(order, list):
            return []
        out = []
        for x in order:
            if str(x).isdigit():
                out.append(int(x))
        return out
    except Exception:
        return []


def _save_queue(root: str, order: List[int]) -> None:
    qp = _queue_path(root)
    with open(qp, "w", encoding="utf-8") as f:
        yaml.safe_dump({"order": order}, f, allow_unicode=True, sort_keys=False)


def _disk_ids(root: str) -> List[int]:
    ids = []
    for fp in glob.glob(os.path.join(_seq_dir(root), "*.yaml")):
        stem = os.path.splitext(os.path.basename(fp))[0]
        if stem.isdigit():
            ids.append(int(stem))
    return sorted(set(ids))


def _next_free_id(root: str) -> int:
    used = set(_disk_ids(root))
    sid = 1
    while sid in used:
        sid += 1
    return sid


def _normalize_id_list(xs: List[Any]) -> List[int]:
    out = []
    for x in xs:
        try:
            out.append(int(x))
        except Exception:
            pass
    return out


def _delete_one(root: str, sid: int) -> None:
    # seq
    try:
        os.remove(_seq_file(root, sid))
    except FileNotFoundError:
        pass

    # templates sid_*
    tdir = _tpl_dir(root)
    for fp in glob.glob(os.path.join(tdir, f"{sid:03d}_*")):
        try:
            os.remove(fp)
        except Exception:
            pass

    # progress
    prog = load_progress()
    if isinstance(prog, dict):
        tasks = prog.get("tasks", {}) or {}
        if isinstance(tasks, dict):
            tasks.pop(f"{sid:03d}", None)
            prog["tasks"] = tasks
            save_progress(prog)


class CreateManyReq(BaseModel):
    n: int = 1
    start_id: Optional[int] = None
    name_prefix: str = "CG_"
    pad: int = 3


class DeleteManyReq(BaseModel):
    ids: List[int]


class ReorderReq(BaseModel):
    order: List[int]


@router.post("/tasks/create_many")
def create_many(req: CreateManyReq):
    """
    批量创建 N 个任务（生成空骨架 yaml），并追加进 queue 末尾。
    """
    root = _active_root()
    n = int(req.n)
    if n <= 0 or n > 500:
        raise HTTPException(400, "n must be in [1, 500]")

    order = _load_queue(root)
    created = []

    sid = int(req.start_id) if req.start_id is not None else _next_free_id(root)
    used = set(_disk_ids(root))

    for _ in range(n):
        while sid in used:
            sid += 1

        path = _seq_file(root, sid)
        data = {
            "id": sid,
            "name": f"{req.name_prefix}{sid:0{req.pad}d}",
            "entry": {"mode": "gallery", "template": ""},
            "preplay": {"actions": [], "interval_sec": 0.2},
            "play": {"max_steps": 500, "advance": {"type": "click", "x": 0, "y": 0}, "interval_sec": 0.2},
            "end": {"mode": "diff", "threshold": 3.0, "stable_n": 10, "tpl": ""},
        }

        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)

        used.add(sid)
        created.append(sid)
        sid += 1

    for x in created:
        if x not in order:
            order.append(x)
    _save_queue(root, order)

    return {"ok": True, "created": created}


@router.post("/tasks/delete_many")
def delete_many(req: DeleteManyReq):
    """
    批量删除任务：删除 yaml + templates sid_* + progress 状态，并从 queue 移除。
    """
    root = _active_root()
    ids = sorted(set(_normalize_id_list(req.ids or [])))
    if not ids:
        return {"ok": True, "deleted": []}

    for sid in ids:
        _delete_one(root, sid)

    order = [x for x in _load_queue(root) if x not in set(ids)]
    _save_queue(root, order)

    return {"ok": True, "deleted": ids}


@router.post("/queue/reorder")
def reorder(req: ReorderReq):
    """
    直接覆盖 queue 顺序（去重保序）。
    """
    root = _active_root()
    seen = set()
    out = []
    for x in _normalize_id_list(req.order or []):
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    _save_queue(root, out)
    return {"ok": True, "order": out}
