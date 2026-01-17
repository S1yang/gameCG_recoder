# api/templates.py
import os
import sys
import glob
import subprocess
import time
import yaml
import cv2
import numpy as np
import pyautogui
from typing import Optional

import base64
import uuid
from typing import Dict, Tuple

from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse,Response
from pydantic import BaseModel

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from game_registry import GameRegistry
from state import set_game_root
from ui.window import find_window_rect, activate_window_force
from ui.capture import grab_region_bgr

router = APIRouter(prefix="/templates", tags=["templates"])

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

_FRAME_CACHE: Dict[str, Tuple[float, "np.ndarray"]] = {}
_FRAME_TTL_SEC = 60.0  # 1分钟足够你框选

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


def _load_game_config(root: str) -> dict:
    # 与 runner.py 对齐：优先 game.yaml，其次 config.yaml
    cfg_path = os.path.join(root, "game.yaml")
    if not os.path.exists(cfg_path):
        cfg_path = os.path.join(root, "config.yaml")
    if not os.path.exists(cfg_path):
        return {}
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _unique_name(tdir: str, filename: str) -> str:
    base, ext = os.path.splitext(filename)
    cand = filename
    i = 1
    while os.path.exists(os.path.join(tdir, cand)):
        cand = f"{base}_{i}{ext}"
        i += 1
    return cand


class DeleteReq(BaseModel):
    name: str

class CaptureRoiReq(BaseModel):
    name: Optional[str] = None
    bring_to_front: bool = True
    sleep_ms: int = 250


class CaptureFrameReq(BaseModel):
    bring_to_front: bool = True
    sleep_ms: int = 250
    restore_app_title: Optional[str] = None  # 新增：告诉后端截完图要激活谁

class CropSaveReq(BaseModel):
    frame_id: str
    name: str
    x: int
    y: int
    w: int
    h: int

class CaptureReq(BaseModel):
    name: Optional[str] = None        # 例如 "001_entry.png"，也可以不传
    bring_to_front: bool = True       # 默认截图前拉前景
    sleep_ms: int = 250               # 拉前景后等待，避免截到切换中的画面


@router.get("")
def list_templates() -> dict:
    """返回 active game 下 templates 目录的文件名（basename）列表"""
    root = _active_root()
    tdir = _tpl_dir(root)

    files = []
    for fp in glob.glob(os.path.join(tdir, "*")):
        bn = os.path.basename(fp)
        if _ext_ok(bn):
            files.append(bn)

    files.sort()
    return {"root": root, "templates": files}


@router.get("/file")
def get_template_file(name: str = Query(...)) -> FileResponse:
    """
    直接返回模板图片文件，给前端 <img src=...> 预览用
    GET /templates/file?name=001_entry.png
    """
    root = _active_root()
    tdir = _tpl_dir(root)
    try:
        bn = _safe_basename(name)
    except Exception as e:
        raise HTTPException(400, str(e))

    if not _ext_ok(bn):
        raise HTTPException(400, f"unsupported file ext: {bn}")

    path = os.path.join(tdir, bn)
    if not os.path.exists(path):
        raise HTTPException(404, f"template not found: {bn}")

    return FileResponse(path)


@router.post("/upload")
async def upload_template(file: UploadFile = File(...), name: Optional[str] = None) -> dict:
    """上传模板图片到 active game 的 templates 目录。"""
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
    """删除 templates 目录下指定文件（按 basename）"""
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
    """在系统文件管理器中定位该模板文件（方便你人工核对）"""
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


@router.post("/capture")
def capture_window(req: CaptureReq) -> dict:
    """
    截取 active game 的游戏窗口，并保存到 templates/ 下。
    - 读取 game.yaml/config.yaml 的 game_window_title
    - 默认先 activate_window 以确保截图正确
    """
    root = _active_root()
    tdir = _tpl_dir(root)

    cfg = _load_game_config(root)
    title_kw = str(cfg.get("game_window_title", "")).strip()
    if not title_kw:
        raise HTTPException(400, "config missing: game_window_title")

    # 1) 拉前景（关键）
    if req.bring_to_front:
        try:
            activate_window_force(title_kw)
            time.sleep(max(0, int(req.sleep_ms)) / 1000.0)
        except Exception as e:
            raise HTTPException(500, f"activate_window failed: {e}")

    # 2) 找窗口 + 截整窗
    try:
        rect = find_window_rect(title_kw)
        img = grab_region_bgr(rect.left, rect.top, rect.width, rect.height)
    except Exception as e:
        raise HTTPException(500, f"capture failed: {e}")

    if img is None:
        raise HTTPException(500, "capture failed: empty image")

    # 3) 命名
    filename = req.name.strip() if isinstance(req.name, str) and req.name.strip() else ""
    if filename:
        filename = _safe_basename(filename)
        # 没后缀就补 .png
        if os.path.splitext(filename)[1] == "":
            filename += ".png"
        if not _ext_ok(filename):
            raise HTTPException(400, f"unsupported file ext: {filename}")
    else:
        filename = time.strftime("capture_%Y%m%d_%H%M%S.png")

    filename = _unique_name(tdir, filename)

    # 4) 写文件
    dst = os.path.join(tdir, filename)
    ok = cv2.imwrite(dst, img)
    if not ok:
        raise HTTPException(500, "cv2.imwrite failed")

    return {
        "ok": True,
        "root": root,
        "name": filename,
        "path": os.path.abspath(dst),
        "window_title": title_kw,
        "size": [int(img.shape[1]), int(img.shape[0])],
    }

@router.get("/thumb")
def get_template_thumb(
    name: str = Query(...),
    w: int = Query(240, ge=64, le=1024),
    q: int = Query(80, ge=40, le=95),
    fmt: str = Query("webp"),
) -> Response:
    """
    返回压缩缩略图（默认 webp），用于 Step2 小缩略图展示
    GET /templates/thumb?name=001_pre_01.png&w=240&q=80&fmt=webp
    """
    root = _active_root()
    tdir = _tpl_dir(root)

    try:
        bn = _safe_basename(name)
    except Exception as e:
        raise HTTPException(400, str(e))

    if not _ext_ok(bn):
        raise HTTPException(400, f"unsupported file ext: {bn}")

    path = os.path.join(tdir, bn)
    if not os.path.exists(path):
        raise HTTPException(404, f"template not found: {bn}")

    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(500, "cv2.imread failed")

    h, ww = img.shape[:2]
    if ww <= 0 or h <= 0:
        raise HTTPException(500, "invalid image size")

    # 按宽度等比缩放
    if ww != w:
        new_h = max(1, int(h * (w / ww)))
        img = cv2.resize(img, (w, new_h), interpolation=cv2.INTER_AREA)

    fmt = (fmt or "webp").lower()
    if fmt not in ("webp", "jpg", "jpeg", "png"):
        fmt = "webp"

    if fmt == "webp":
        ok, buf = cv2.imencode(".webp", img, [int(cv2.IMWRITE_WEBP_QUALITY), int(q)])
        mime = "image/webp"
    elif fmt in ("jpg", "jpeg"):
        ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), int(q)])
        mime = "image/jpeg"
    else:
        ok, buf = cv2.imencode(".png", img)
        mime = "image/png"

    if not ok:
        raise HTTPException(500, "imencode failed")

    return Response(content=buf.tobytes(), media_type=mime)

@router.post("/capture_roi")
def capture_roi(req: CaptureRoiReq) -> dict:
    """
    ROI 交互截图：
    1) 激活游戏窗口到前台
    2) 截全屏
    3) OpenCV 弹窗让用户框选 ROI
    4) 裁剪 ROI 并保存到 templates/
    """
    root = _active_root()
    tdir = _tpl_dir(root)

    cfg = _load_game_config(root)
    title_kw = str(cfg.get("game_window_title", "")).strip()
    if not title_kw:
        raise HTTPException(400, "config missing: game_window_title")

    # 激活窗口（你已经修复成 force 版本也行）
    if req.bring_to_front:
        try:
            activate_window_force(title_kw)  # 如果你没导入 force 就换成 activate_window
            time.sleep(max(0, int(req.sleep_ms)) / 1000.0)
        except Exception as e:
            raise HTTPException(500, f"activate_window failed: {e}")

    # 读窗口 rect（只在窗口区域内选 ROI，会更符合预期）
    try:
        rect = find_window_rect(title_kw)
    except Exception as e:
        raise HTTPException(500, f"find_window_rect failed: {e}")

    # 截窗口区域（先截整个窗口，再在这张图上选 ROI）
    try:
        img = grab_region_bgr(rect.left, rect.top, rect.width, rect.height)
    except Exception as e:
        raise HTTPException(500, f"grab_region_bgr failed: {e}")

    if img is None:
        raise HTTPException(500, "capture failed: empty image")

    # OpenCV ROI 选择（会弹窗，需要你拖选后回车/空格确认，ESC取消）
    try:
        vis = img.copy()
        roi = cv2.selectROI("Select ROI (Enter/Space=OK, Esc=Cancel)", vis, showCrosshair=True, fromCenter=False)
        cv2.destroyWindow("Select ROI (Enter/Space=OK, Esc=Cancel)")
    except Exception as e:
        raise HTTPException(500, f"selectROI failed: {e}")

    x, y, w, h = map(int, roi)
    if w <= 1 or h <= 1:
        raise HTTPException(400, "ROI canceled or too small")

    crop = img[y:y+h, x:x+w]
    if crop is None or crop.size == 0:
        raise HTTPException(500, "ROI crop empty")

    # 命名
    filename = req.name.strip() if isinstance(req.name, str) and req.name.strip() else ""
    if filename:
        filename = _safe_basename(filename)
        if os.path.splitext(filename)[1] == "":
            filename += ".png"
        if not _ext_ok(filename):
            raise HTTPException(400, f"unsupported file ext: {filename}")
    else:
        filename = time.strftime("roi_%Y%m%d_%H%M%S.png")
    filename = _unique_name(tdir, filename)

    dst = os.path.join(tdir, filename)
    ok = cv2.imwrite(dst, crop)
    if not ok:
        raise HTTPException(500, "cv2.imwrite failed")

    return {
        "ok": True,
        "mode": "roi",
        "name": filename,
        "path": os.path.abspath(dst),
        "window_title": title_kw,
        "roi": [x, y, w, h],
        "size": [int(crop.shape[1]), int(crop.shape[0])],
    }


def _prune_frames():
    now = time.time()
    dead = [k for k, (ts, _) in _FRAME_CACHE.items() if (now - ts) > _FRAME_TTL_SEC]
    for k in dead:
        _FRAME_CACHE.pop(k, None)

@router.post("/frame")
def capture_frame(req: CaptureFrameReq) -> dict:
    """
    激活窗口 + 截取窗口图像，但不落盘；返回 frame_id + image_b64 给前端做 ROI。
    """
    _prune_frames()

    root = _active_root()
    cfg = _load_game_config(root)
    title_kw = str(cfg.get("game_window_title", "")).strip()
    if not title_kw:
        raise HTTPException(400, "config missing: game_window_title")

    # A. 激活游戏窗口
    if req.bring_to_front:
        try:
            activate_window_force(title_kw)
            time.sleep(max(0, int(req.sleep_ms)) / 1000.0)
        except Exception as e:
            raise HTTPException(500, f"activate_window failed: {e}")

    # B. 截图
    try:
        rect = find_window_rect(title_kw)
        img = grab_region_bgr(rect.left, rect.top, rect.width, rect.height)
    except Exception as e:
        # 截图失败也要尝试切回主程序，否则用户会卡在游戏界面
        if req.restore_app_title:
            try:
                activate_window_force(req.restore_app_title)
            except:
                pass
        raise HTTPException(500, f"capture failed: {e}")

    # C. 【关键修复】截图完成后，立刻把 Electron 窗口拉回前台
    if req.restore_app_title:
        try:
            # 稍微等一下，让系统反应过来
            # time.sleep(0.1) 
            activate_window_force(req.restore_app_title)
        except Exception as e:
            print(f"[Warn] failed to restore app window: {e}")

    if img is None or img.size == 0:
        raise HTTPException(500, "capture failed: empty image")

    frame_id = uuid.uuid4().hex
    _FRAME_CACHE[frame_id] = (time.time(), img)

    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise HTTPException(500, "imencode failed")

    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    return {
        "ok": True,
        "frame_id": frame_id,
        "window_title": title_kw,
        "size": [int(img.shape[1]), int(img.shape[0])],
        "image_b64": "data:image/png;base64," + b64,
    }

@router.post("/crop_save")
def crop_save(req: CropSaveReq) -> dict:
    """
    从缓存帧 frame_id 裁剪 ROI，保存到 templates/ 下，返回保存后的文件名。
    """
    _prune_frames()

    root = _active_root()
    tdir = _tpl_dir(root)

    frame_id = (req.frame_id or "").strip()
    if frame_id not in _FRAME_CACHE:
        raise HTTPException(404, "frame expired or not found")

    ts, img = _FRAME_CACHE[frame_id]
    if img is None or img.size == 0:
        raise HTTPException(500, "cached frame invalid")

    x, y, w, h = int(req.x), int(req.y), int(req.w), int(req.h)
    if w <= 2 or h <= 2:
        raise HTTPException(400, "ROI too small")

    H, W = img.shape[:2]
    x = max(0, min(x, W - 1))
    y = max(0, min(y, H - 1))
    w = max(1, min(w, W - x))
    h = max(1, min(h, H - y))

    crop = img[y:y+h, x:x+w]
    if crop is None or crop.size == 0:
        raise HTTPException(500, "ROI crop empty")

    filename = _safe_basename(req.name)
    if os.path.splitext(filename)[1] == "":
        filename += ".png"
    if not _ext_ok(filename):
        raise HTTPException(400, f"unsupported file ext: {filename}")

    filename = _unique_name(tdir, filename)
    dst = os.path.join(tdir, filename)

    ok = cv2.imwrite(dst, crop)
    if not ok:
        raise HTTPException(500, "cv2.imwrite failed")

    return {
        "ok": True,
        "name": filename,
        "path": os.path.abspath(dst),
        "roi": [x, y, w, h],
        "size": [int(crop.shape[1]), int(crop.shape[0])],
    }

