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

# 🟢 新增：模板存储目录
def _task_tpl_dir(root: str) -> str:
    p = os.path.join(root, "task_templates")
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

    g = d.get("group", "")
    if isinstance(g, str):
        d["group"] = g.strip()
    else:
        d["group"] = ""

    return d


# ----------------------------
# Helpers
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
    basename: str = ""  # 🟢 New: 允许指定文件名
    template_name: Optional[str] = None # 🟢 New: 允许从模板创建


class PutProgressReq(BaseModel):
    progress: Dict[str, Any]

class SaveTemplateReq(BaseModel):
    name: str
    content: Dict[str, Any]


# ----------------------------
# Task Templates APIs (New)
# ----------------------------

@router.get("/task_templates")
def get_task_templates():
    """列出所有已保存的任务模板"""
    root = _active_root()
    tdir = _task_tpl_dir(root)
    templates = []
    for fp in glob.glob(os.path.join(tdir, "*.yaml")):
        stem = os.path.splitext(os.path.basename(fp))[0]
        templates.append(stem)
    templates.sort()
    return {"templates": templates}

@router.post("/task_templates")
def save_task_template(req: SaveTemplateReq):
    """保存当前任务配置为模板"""
    root = _active_root()
    tdir = _task_tpl_dir(root)
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "template name required")
    
    # 防止路径穿越
    safe_name = os.path.basename(name)
    path = os.path.join(tdir, f"{safe_name}.yaml")
    
    try:
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(req.content, f, allow_unicode=True, sort_keys=False)
    except Exception as e:
        raise HTTPException(500, f"failed to save template: {e}")
        
    return {"ok": True, "name": safe_name}

@router.delete("/task_templates/{name}")
def delete_task_template(name: str):
    root = _active_root()
    tdir = _task_tpl_dir(root)
    safe_name = os.path.basename(name)
    path = os.path.join(tdir, f"{safe_name}.yaml")
    
    if os.path.exists(path):
        try:
            os.remove(path)
        except Exception as e:
            raise HTTPException(500, f"failed to delete: {e}")
            
    return {"ok": True}


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
        status = str(st.get("status", "")).strip()

        group = ""
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    d = yaml.safe_load(f) or {}
                group = str(d.get("group", "")).strip()
            except Exception:
                pass

        out.append({
            "id": sid,
            "name": name,
            "status": status,
            "basename": st.get("basename", ""),
            "out": st.get("out", ""),
            "error": st.get("error", ""),
            "group": group, 
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

    order = _load_queue_order(root)
    if sid not in order:
        order.append(sid)
        _save_queue_order(root, order)

    return {"ok": True, "task": d}


@router.post("/tasks")
def create_task(req: CreateTaskReq):
    root = _active_root()

    # 1. 确定 ID
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

    # 2. 准备初始内容
    initial_content = {}
    
    # 🟢 如果指定了模板，尝试加载模板内容
    if req.template_name:
        tpl_path = os.path.join(_task_tpl_dir(root), f"{req.template_name}.yaml")
        if os.path.exists(tpl_path):
            try:
                with open(tpl_path, "r", encoding="utf-8") as f:
                    initial_content = yaml.safe_load(f) or {}
            except Exception as e:
                print(f"[Warn] Failed to load template {req.template_name}: {e}")

    # 3. 覆盖关键字段 (ID, Name, Basename)
    initial_content["id"] = sid
    
    # Name
    final_name = req.name.strip() or initial_content.get("name") or f"CG_{sid:03d}"
    initial_content["name"] = final_name
    
    # Basename (位于 record.basename)
    rec = initial_content.get("record", {})
    if not isinstance(rec, dict): rec = {}
    final_basename = req.basename.strip() or rec.get("basename") or final_name
    rec["basename"] = final_basename
    initial_content["record"] = rec

    # 4. 规范化并保存
    d = normalize_seq(sid, initial_content)
    try:
        with open(p, "w", encoding="utf-8") as f:
            yaml.safe_dump(d, f, allow_unicode=True, sort_keys=False)
    except Exception as e:
        raise HTTPException(500, f"failed to create task {sid:03d}: {e}")

    # 5. 加入队列
    order = _load_queue_order(root)
    if sid not in order:
        order.append(sid)
        _save_queue_order(root, order)

    return {"ok": True, "id": sid, "task": d}


@router.delete("/tasks/{sid}")
def delete_task(sid: int):
    root = _active_root()

    try:
        os.remove(_seq_file(root, sid))
    except FileNotFoundError:
        pass
    except Exception as e:
        raise HTTPException(500, f"failed to delete yaml: {e}")

    prog = load_progress()
    if isinstance(prog, dict):
        tasks = prog.get("tasks", {}) or {}
        if isinstance(tasks, dict):
            tasks.pop(f"{sid:03d}", None)
            prog["tasks"] = tasks
            save_progress(prog)

    order = [x for x in _load_queue_order(root) if x != sid]
    _save_queue_order(root, order)

    return {"ok": True}


# ----------------------------
# Queue APIs
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
# Progress APIs
# ----------------------------

@router.get("/progress")
def get_progress():
    _active_root()
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
    _active_root()
    prog = load_progress()
    prog["run_only"] = [f"{int(sid):03d}"]
    save_progress(prog)
    return {"ok": True, "progress": load_progress()}