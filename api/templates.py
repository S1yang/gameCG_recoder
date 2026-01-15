# api/templates.py
import os
import sys
import glob
import subprocess
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from game_registry import GameRegistry
from state import set_game_root

router = APIRouter(prefix="/templates", tags=["templates"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def _active_root() -> str:
    root = GameRegistry(BASE_DIR).resolve_active_root()
    set_game_root(root)
    return root


def _tpl_dir(root: str) -> str:
    p = os.path.join(root, "templates")
    os.makedirs(p, exist_ok=True)
    return p


def _safe_basename(name: str) -> str:
    # 防止路径穿越，只允许 basename
    name = os.path.basename(name).strip()
    if not name:
        raise ValueError("empty filename")
    return name


def _ext_ok(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in ALLOWED_EXT


def _open_in_explorer(path: str):
    path = os.path.abspath(path)
    if not os.path.exists(path):
        raise FileNotFoundError(path)

    if sys.platform.startswith("win"):
        subprocess.Popen(["explorer", "/select,", path])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", path])
    else:
        subprocess.Popen(["xdg-open", os.path.dirname(path)])


class DeleteReq(BaseModel):
    name: str


@router.get("")
def list_templates() -> dict:
    """
    返回 active game 下 templates 目录的文件名（basename）列表
    """
    root = _active_root()
    tdir = _tpl_dir(root)

    files = []
    for fp in glob.glob(os.path.join(tdir, "*")):
        bn = os.path.basename(fp)
        if _ext_ok(bn):
            files.append(bn)

    files.sort()
    return {"root": root, "templates": files}


@router.post("/upload")
async def upload_template(file: UploadFile = File(...), name: Optional[str] = None) -> dict:
    """
    上传模板图片到 active game 的 templates 目录。
    - file: multipart 文件
    - name: 可选，重命名保存（必须带后缀）
    """
    root = _active_root()
    tdir = _tpl_dir(root)

    filename = name.strip() if isinstance(name, str) and name.strip() else file.filename
    filename = _safe_basename(filename)

    if not _ext_ok(filename):
        raise HTTPException(400, f"unsupported file ext: {filename}")

    dst = os.path.join(tdir, filename)

    try:
        data = await file.read()
        with open(dst, "wb") as f:
            f.write(data)
    except Exception as e:
        raise HTTPException(500, f"upload failed: {e}")

    return {"ok": True, "name": filename, "path": os.path.abspath(dst)}


@router.post("/delete")
def delete_template(req: DeleteReq) -> dict:
    """
    删除 templates 目录下指定文件（按 basename）
    """
    root = _active_root()
    tdir = _tpl_dir(root)

    try:
        name = _safe_basename(req.name)
    except Exception as e:
        raise HTTPException(400, str(e))

    if not _ext_ok(name):
        raise HTTPException(400, f"unsupported file ext: {name}")

    fp = os.path.join(tdir, name)
    try:
        os.remove(fp)
    except FileNotFoundError:
        raise HTTPException(404, f"template not found: {name}")
    except Exception as e:
        raise HTTPException(500, f"delete failed: {e}")

    return {"ok": True, "name": name}


@router.post("/open")
def open_template(req: DeleteReq) -> dict:
    """
    在系统文件管理器中定位该模板文件（方便你人工核对）
    """
    root = _active_root()
    tdir = _tpl_dir(root)
    name = _safe_basename(req.name)
    fp = os.path.join(tdir, name)
    try:
        _open_in_explorer(fp)
    except FileNotFoundError:
        raise HTTPException(404, f"template not found: {name}")
    except Exception as e:
        raise HTTPException(500, f"open failed: {e}")

    return {"ok": True, "name": name}
