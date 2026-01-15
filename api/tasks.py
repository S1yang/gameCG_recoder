# api/tasks.py
import os
import sys
import glob
import yaml
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from game_registry import GameRegistry
from state import set_game_root, load_progress, save_progress

router = APIRouter(prefix="", tags=["tasks"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


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


# ----------------------------
# Runner-aligned schema
# ----------------------------

def normalize_seq(sid: int, d: dict) -> dict:
    """
    对齐 runner.py 的 normalize_seq
    schema:
      entry: {mode: gallery|roam, template: "001_entry.png" 或绝对路径}
      preplay: {actions: [{template, delay, appear_timeout_sec?}, ...]}
      play: {advance_method: mouse_left|enter, pacing: system|audio, mode: default}
      end: {template: "001_end.png"}
      record: {basename: "..."}
    """
    if not isinstance(d, dict):
        d = {}
    d = dict(d)

    d.setdefault("id", sid)
    d.setdefault("name", d.get("name") or f"CG_{sid:03d}")

    entry = d.get("entry") if isinstance(d.get("entry"), dict) else {}
    entry.setdefault("mode", "gallery")
    entry.setdefault("template", "")
    d["entry"] = entry

    pre = d.get("preplay") if isinstance(d.get("preplay"), dict) else {}
    acts = pre.get("actions") if isinstance(pre.get("actions"), list) else []
    norm_acts = []
    for a in acts:
        if not isinstance(a, dict):
            continue
        tpl = str(a.get("template", "")).strip()
        try:
            delay = float(a.get("delay", 0.5))
        except Exception:
            delay = 0.5

        item = {"template": tpl, "delay": delay}

        # 可选：appear_timeout_sec
        try:
            ato = float(a.get("appear_timeout_sec", 0.0) or 0.0)
        except Exception:
            ato = 0.0
        if ato > 0:
            item["appear_timeout_sec"] = ato

        norm_acts.append(item)
    pre["actions"] = norm_acts
    d["preplay"] = pre

    play = d.get("play") if isinstance(d.get("play"), dict) else {}
    play.setdefault("advance_method", "mouse_left")
    play.setdefault("pacing", "system")
    play.setdefault("mode", "default")
    d["play"] = play

    end = d.get("end") if isinstance(d.get("end"), dict) else {}
    end.setdefault("template", "")
    d["end"] = end

    rec = d.get("record") if isinstance(d.get("record"), dict) else {}
    rec.setdefault("basename", d.get("name", f"CG_{sid:03d}"))
    d["record"] = rec

    return d


# ----------------------------
# queue helpers (optional)
# ----------------------------

def _load_queue_order(root: str) -> List[int]:
    qpath = _queue_path(root)
    if not os.path.exists(qpath):
        return []
    try:
        with open(qpath, "r", encoding="utf-8") as f:
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


def _save_queue_order(root: str, order: List[int]) -> None:
    qpath = _queue_path(root)
    with open(qpath, "w", encoding="utf-8") as f:
        yaml.safe_dump({"order": order}, f, allow_unicode=True, sort_keys=False)


def _list_disk_ids(root: str) -> List[int]:
    ids = []
    for fp in glob.glob(os.path.join(_seq_dir(root), "*.yaml")):
        stem = os.path.splitext(os.path.basename(fp))[0]
        if stem.isdigit():
            ids.append(int(stem))
    return sorted(set(ids))


def list_seq_ids(root: str) -> List[int]:
    disk_ids = _list_disk_ids(root)
    order_ids = _load_queue_order(root)

    merged: List[int] = []
    seen = set()

    for x in order_ids:
        if x in seen:
            continue
        merged.append(x)
        seen.add(x)

    for x in disk_ids:
        if x in seen:
            continue
        merged.append(x)
        seen.add(x)

    return merged


# ----------------------------
# Models
# ----------------------------

class PutQueueReq(BaseModel):
    order: List[int]


class CreateTaskReq(BaseModel):
    id: Optional[int] = None
    name: str = ""


class PutProgressReq(BaseModel):
    progress: Dict[str, Any]


# ----------------------------
# Tasks APIs
# ----------------------------

@router.get("/tasks")
def get_tasks():
    root = _active_root()
    ids = list_seq_ids(root)

    prog = load_progress()
    tasks_state = (prog.get("tasks", {}) or {}) if isinstance(prog, dict) else {}

    out = []
    for sid in ids:
        p = _seq_file(root, sid)
        name = f"CG_{sid:03d}"
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    d = yaml.safe_load(f) or {}
                d = normalize_seq(sid, d)
                name = (d.get("name") or name).strip()
            except Exception:
                pass

        st = tasks_state.get(f"{sid:03d}", {}) or {}
        status = str(st.get("status", "")).strip()  # done/running/failed/...

        out.append({
            "id": sid,
            "name": name,
            "status": status,
            "basename": st.get("basename", ""),
            "out": st.get("out", ""),
            "error": st.get("error", ""),
        })

    return {"root": root, "tasks": out}


@router.get("/tasks/{sid}")
def get_task(sid: int):
    root = _active_root()
    p = _seq_file(root, sid)
    if not os.path.exists(p):
        return {"task": normalize_seq(sid, {})}

    try:
        with open(p, "r", encoding="utf-8") as f:
            d = yaml.safe_load(f) or {}
        return {"task": normalize_seq(sid, d)}
    except Exception as e:
        raise HTTPException(500, f"failed to load task {sid:03d}: {e}")


@router.put("/tasks/{sid}")
def put_task(sid: int, body: Dict[str, Any]):
    root = _active_root()
    d = normalize_seq(sid, body or {})
    p = _seq_file(root, sid)

    try:
        with open(p, "w", encoding="utf-8") as f:
            yaml.safe_dump(d, f, allow_unicode=True, sort_keys=False)
    except Exception as e:
        raise HTTPException(500, f"failed to save task {sid:03d}: {e}")

    # 维持 queue.yaml（可选；你未来想去掉也行）
    order = _load_queue_order(root)
    if sid not in order:
        order.append(sid)
        _save_queue_order(root, order)

    return {"ok": True, "task": d}


@router.post("/tasks")
def create_task(req: CreateTaskReq):
    root = _active_root()

    if req.id is None:
        used = set(_list_disk_ids(root))
        sid = 1
        while sid in used:
            sid += 1
    else:
        sid = int(req.id)

    p = _seq_file(root, sid)
    if os.path.exists(p):
        raise HTTPException(400, f"task {sid:03d} already exists")

    d = normalize_seq(sid, {"name": (req.name.strip() or f"CG_{sid:03d}")})
    try:
        with open(p, "w", encoding="utf-8") as f:
            yaml.safe_dump(d, f, allow_unicode=True, sort_keys=False)
    except Exception as e:
        raise HTTPException(500, f"failed to create task {sid:03d}: {e}")

    order = _load_queue_order(root)
    if sid not in order:
        order.append(sid)
        _save_queue_order(root, order)

    return {"ok": True, "id": sid, "task": d}


@router.delete("/tasks/{sid}")
def delete_task(sid: int):
    root = _active_root()

    # 1) 删除 yaml
    try:
        os.remove(_seq_file(root, sid))
    except FileNotFoundError:
        pass
    except Exception as e:
        raise HTTPException(500, f"failed to delete yaml: {e}")

    # 2) 删除 templates/{sid:03d}_*
    tdir = _tpl_dir(root)
    for fp in glob.glob(os.path.join(tdir, f"{sid:03d}_*")):
        try:
            os.remove(fp)
        except Exception:
            pass

    # 3) progress.json 清理 task
    prog = load_progress()
    if isinstance(prog, dict):
        tasks = prog.get("tasks", {}) or {}
        if isinstance(tasks, dict):
            tasks.pop(f"{sid:03d}", None)
            prog["tasks"] = tasks
            save_progress(prog)

    # 4) queue.yaml 移除
    order = [x for x in _load_queue_order(root) if x != sid]
    _save_queue_order(root, order)

    return {"ok": True}


# ----------------------------
# Queue APIs (still useful for reorder)
# ----------------------------

@router.get("/queue")
def get_queue():
    root = _active_root()
    return {"order": _load_queue_order(root)}


@router.put("/queue")
def put_queue(req: PutQueueReq):
    root = _active_root()

    order = []
    seen = set()
    for x in req.order:
        x = int(x)
        if x in seen:
            continue
        order.append(x)
        seen.add(x)

    _save_queue_order(root, order)
    return {"ok": True, "order": order}


# ----------------------------
# Progress APIs (UI 需要 Reset/RunSelected 等)
# ----------------------------

@router.get("/progress")
def get_progress():
    _active_root()  # ensure set_game_root
    return load_progress()


@router.put("/progress")
def put_progress(req: PutProgressReq):
    _active_root()
    if not isinstance(req.progress, dict):
        raise HTTPException(400, "progress must be a dict")
    save_progress(req.progress)
    return {"ok": True, "progress": load_progress()}


@router.post("/progress/reset/{sid}")
def reset_task_status(sid: int):
    _active_root()
    prog = load_progress()
    tasks = prog.get("tasks", {}) or {}
    if isinstance(tasks, dict):
        tasks.pop(f"{sid:03d}", None)
        prog["tasks"] = tasks
        save_progress(prog)
    return {"ok": True, "progress": load_progress()}


@router.post("/progress/run_only/{sid}")
def set_run_only(sid: int):
    """
    给 runner 用：只跑某个 sid（runner.py 会读取 progress["run_only"]）
    """
    _active_root()
    prog = load_progress()
    prog["run_only"] = [f"{int(sid):03d}"]
    save_progress(prog)
    return {"ok": True, "progress": load_progress()}
