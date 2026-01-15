import os
import sys
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from game_registry import GameRegistry
from state import set_game_root, load_progress, save_progress

router = APIRouter(prefix="/progress", tags=["progress"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _active_root() -> str:
    root = GameRegistry(BASE_DIR).resolve_active_root()
    set_game_root(root)
    return root


class BatchIds(BaseModel):
    ids: List[int]


class BatchStatusReq(BaseModel):
    ids: List[int]
    status: str = ""  # "" -> clear state


@router.post("/reset/{sid}")
def reset_one(sid: int):
    _active_root()
    prog = load_progress()
    if not isinstance(prog, dict):
        prog = {"tasks": {}}
    tasks = prog.get("tasks", {}) or {}
    if not isinstance(tasks, dict):
        tasks = {}
    tasks.pop(f"{sid:03d}", None)
    prog["tasks"] = tasks
    ro = prog.get("run_only", None)
    if isinstance(ro, list):
        prog["run_only"] = [x for x in ro if str(x) != f"{sid:03d}"]
    save_progress(prog)
    return {"ok": True}


@router.post("/reset_batch")
def reset_batch(req: BatchIds):
    _active_root()
    prog = load_progress()
    if not isinstance(prog, dict):
        prog = {"tasks": {}}
    tasks = prog.get("tasks", {}) or {}
    if not isinstance(tasks, dict):
        tasks = {}

    for sid in req.ids:
        tasks.pop(f"{int(sid):03d}", None)

    prog["tasks"] = tasks

    ro = prog.get("run_only", None)
    if isinstance(ro, list):
        drop = set(f"{int(sid):03d}" for sid in req.ids)
        prog["run_only"] = [x for x in ro if str(x) not in drop]

    save_progress(prog)
    return {"ok": True}


@router.post("/set_status_batch")
def set_status_batch(req: BatchStatusReq):
    """
    status:
      - "done"/"failed"/"running"/... -> write tasks[sid].status = status
      - "" -> clear tasks[sid] (mark as undone)
    """
    _active_root()
    prog = load_progress()
    if not isinstance(prog, dict):
        prog = {"tasks": {}}
    tasks = prog.get("tasks", {}) or {}
    if not isinstance(tasks, dict):
        tasks = {}

    st = (req.status or "").strip()

    for sid in req.ids:
        k = f"{int(sid):03d}"
        if st == "":
            tasks.pop(k, None)
        else:
            cur = tasks.get(k, {}) or {}
            cur["status"] = st
            cur["ts"] = time.time()
            tasks[k] = cur

    prog["tasks"] = tasks
    save_progress(prog)
    return {"ok": True, "status": st, "count": len(req.ids)}


@router.post("/run_only/{sid}")
def set_run_only(sid: int):
    _active_root()
    prog = load_progress()
    if not isinstance(prog, dict):
        prog = {"tasks": {}}
    prog["run_only"] = [f"{sid:03d}"]
    save_progress(prog)
    return {"ok": True, "run_only": prog["run_only"]}


@router.post("/run_only_batch")
def set_run_only_batch(req: BatchIds):
    _active_root()
    prog = load_progress()
    if not isinstance(prog, dict):
        prog = {"tasks": {}}
    prog["run_only"] = [f"{int(sid):03d}" for sid in req.ids]
    save_progress(prog)
    return {"ok": True, "run_only": prog["run_only"]}


@router.post("/clear_run_only")
def clear_run_only():
    _active_root()
    prog = load_progress()
    if not isinstance(prog, dict):
        prog = {"tasks": {}}
    prog.pop("run_only", None)
    save_progress(prog)
    return {"ok": True}

