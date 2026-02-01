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
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

import re

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


def _ext_ok(name: str) -> bool:
    return os.path.splitext(name)[1].lower() in ALLOWED_EXT


# Windows 不允许的文件名字符：\ / : * ? " < > |
# 这里不禁止中文，只做非法字符替换 + 去掉末尾点/空格 + 防路径穿越
_WIN_ILLEGAL = r'<>:"/\\|?*'


def _safe_basename(name: str) -> str:
    """
    防止路径穿越，只允许 basename；不限制中文。
    同时清理 Windows 非法字符、末尾点/空格，避免保存失败。
    """
    name = os.path.basename(name or "").strip()
    if not name:
        raise ValueError("empty filename")

    # 替换非法字符（保留中文）
    name = re.sub(f"[{re.escape(_WIN_ILLEGAL)}]", "_", name)

    # 去掉控制字符
    name = re.sub(r"[\x00-\x1F]", "_", name)

    # 去掉末尾点/空格（Windows 不允许）
    name = name.rstrip(" .")

    if not name:
        raise ValueError("empty filename after sanitize")

    # Windows 保留名（不区分大小写）
    base_no_ext = os.path.splitext(name)[0].upper()
    reserved = {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    }
    if base_no_ext in reserved:
        name = f"_{name}"

    return name


def _ensure_ext(name: str, default_ext: str = ".png") -> str:
    ext = os.path.splitext(name)[1]
    if ext == "":
        return name + default_ext
    return name


def _unique_name(tdir: str, filename: str) -> str:
    base, ext = os.path.splitext(filename)
    cand = filename
    i = 1
    while os.path.exists(os.path.join(tdir, cand)):
        cand = f"{base}_{i}{ext}"
        i += 1
    return cand


def _imread_any(path: str, flags=cv2.IMREAD_COLOR) -> "np.ndarray":
    """
    更稳健的读图：兼容 Windows 中文/Unicode 路径。
    使用 np.fromfile + cv2.imdecode 绕过 cv2.imread 的路径编码问题。
    """
    data = np.fromfile(path, dtype=np.uint8)
    if data is None or data.size == 0:
        return None
    img = cv2.imdecode(data, flags)
    return img

def _imwrite_any(path: str, img: "np.ndarray", ext: str, params=None) -> None:
    """
    更稳健的写图：兼容 Windows 中文/Unicode 路径。
    使用 cv2.imencode + ndarray.tofile 绕过 cv2.imwrite 的路径编码问题。
    ext 需要以 .png/.jpg/.webp/.bmp 等形式传入。
    """
    if params is None:
        params = []

    ext = (ext or ".png").lower()
    if ext == ".jpeg":
        ext = ".jpg"

    # 针对不同格式给默认参数（可按需调整）
    if not params:
        if ext == ".jpg":
            params = [int(cv2.IMWRITE_JPEG_QUALITY), 95]
        elif ext == ".webp":
            params = [int(cv2.IMWRITE_WEBP_QUALITY), 90]
        else:
            params = []

    ok, buf = cv2.imencode(ext, img, params)
    if not ok or buf is None:
        raise IOError(f"cv2.imencode failed for ext={ext}")

    # numpy.ndarray.tofile 对 Unicode 路径更友好
    buf.tofile(path)


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
    try:
        filename = _safe_basename(filename)
    except Exception as e:
        raise HTTPException(400, str(e))

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

    try:
        name = _safe_basename(req.name)
    except Exception as e:
        raise HTTPException(400, str(e))

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

    if img is None or img.size == 0:
        raise HTTPException(500, "capture failed: empty image")

    # 3) 命名
    filename = req.name.strip() if isinstance(req.name, str) and req.name.strip() else ""
    try:
        if filename:
            filename = _safe_basename(filename)
            filename = _ensure_ext(filename, ".png")
            if not _ext_ok(filename):
                raise HTTPException(400, f"unsupported file ext: {filename}")
        else:
            filename = time.strftime("capture_%Y%m%d_%H%M%S.png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

    filename = _unique_name(tdir, filename)

    # 4) 写文件（按扩展名编码）
    dst = os.path.join(tdir, filename)
    ext = os.path.splitext(filename)[1].lower()
    try:
        _imwrite_any(dst, img, ext=ext)
    except Exception as e:
        raise HTTPException(500, f"write image failed: {e}")

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

    img = _imread_any(path, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(500, "imread failed")

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

    # 激活窗口
    if req.bring_to_front:
        try:
            activate_window_force(title_kw)
            time.sleep(max(0, int(req.sleep_ms)) / 1000.0)
        except Exception as e:
            raise HTTPException(500, f"activate_window failed: {e}")

    # 读窗口 rect
    try:
        rect = find_window_rect(title_kw)
    except Exception as e:
        raise HTTPException(500, f"find_window_rect failed: {e}")

    # 截窗口区域
    try:
        img = grab_region_bgr(rect.left, rect.top, rect.width, rect.height)
    except Exception as e:
        raise HTTPException(500, f"grab_region_bgr failed: {e}")

    if img is None or img.size == 0:
        raise HTTPException(500, "capture failed: empty image")

    # OpenCV ROI 选择
    try:
        vis = img.copy()
        roi = cv2.selectROI("Select ROI (Enter/Space=OK, Esc=Cancel)", vis, showCrosshair=True, fromCenter=False)
        cv2.destroyWindow("Select ROI (Enter/Space=OK, Esc=Cancel)")
    except Exception as e:
        raise HTTPException(500, f"selectROI failed: {e}")

    x, y, w, h = map(int, roi)
    if w <= 1 or h <= 1:
        raise HTTPException(400, "ROI canceled or too small")

    crop = img[y:y + h, x:x + w]
    if crop is None or crop.size == 0:
        raise HTTPException(500, "ROI crop empty")

    # 命名
    filename = req.name.strip() if isinstance(req.name, str) and req.name.strip() else ""
    try:
        if filename:
            filename = _safe_basename(filename)
            filename = _ensure_ext(filename, ".png")
            if not _ext_ok(filename):
                raise HTTPException(400, f"unsupported file ext: {filename}")
        else:
            filename = time.strftime("roi_%Y%m%d_%H%M%S.png")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

    filename = _unique_name(tdir, filename)
    dst = os.path.join(tdir, filename)

    ext = os.path.splitext(filename)[1].lower()
    try:
        _imwrite_any(dst, crop, ext=ext)
    except Exception as e:
        raise HTTPException(500, f"write image failed: {e}")

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
            except Exception:
                pass
        raise HTTPException(500, f"capture failed: {e}")

    # C. 截图完成后把 Electron 窗口拉回前台
    if req.restore_app_title:
        try:
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

    crop = img[y:y + h, x:x + w]
    if crop is None or crop.size == 0:
        raise HTTPException(500, "ROI crop empty")

    try:
        filename = _safe_basename(req.name)
    except Exception as e:
        raise HTTPException(400, str(e))

    filename = _ensure_ext(filename, ".png")
    if not _ext_ok(filename):
        raise HTTPException(400, f"unsupported file ext: {filename}")

    filename = _unique_name(tdir, filename)
    dst = os.path.join(tdir, filename)

    ext = os.path.splitext(filename)[1].lower()
    try:
        _imwrite_any(dst, crop, ext=ext)
    except Exception as e:
        raise HTTPException(500, f"write image failed: {e}")

    return {
        "ok": True,
        "name": filename,
        "path": os.path.abspath(dst),
        "roi": [x, y, w, h],
        "size": [int(crop.shape[1]), int(crop.shape[0])],
    }
