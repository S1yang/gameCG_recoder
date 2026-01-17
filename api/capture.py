# api/capture.py
import os
import cv2
import time
import yaml
import ctypes  # ✅ 引入 ctypes 用于获取当前窗口
from fastapi import APIRouter, HTTPException
from starlette.responses import FileResponse

from ui.window import find_window_rect, activate_window_force
from ui.capture import grab_region_bgr
from game_registry import GameRegistry

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

router = APIRouter(prefix="/capture", tags=["capture"])

TEMP_DIR = os.path.join(BASE_DIR, ".temp_captures")
os.makedirs(TEMP_DIR, exist_ok=True)

# --- Helper: 获取当前活动窗口标题 ---
def get_foreground_window_title():
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        return buff.value
    except Exception:
        return None

@router.get("/preview_raw")
def capture_preview_raw(window_title: str = ""):
    # 1. 🔍 [Record] 在切走之前，先记住当前 UI 窗口是谁！
    ui_title = get_foreground_window_title()
    print(f"[Capture] Triggered by window: '{ui_title}'")

    # 2. 自动推断游戏窗口标题
    if not window_title:
        try:
            reg = GameRegistry(BASE_DIR)
            root = reg.resolve_active_root() 
            cfg_path = os.path.join(root, "config.yaml")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                    window_title = cfg.get("game_window_title")
                    if not window_title and "game" in cfg:
                        window_title = cfg["game"].get("window_title")
        except Exception as e:
            print(f"[Capture] Auto-resolve failed: {e}")
            pass
            
    if not window_title:
        raise HTTPException(400, "Could not determine game window title")
    
    print(f"[Capture] Target Game Window: {window_title}")

    try:
        # 3. 🚀 [Activate] 激活游戏窗口
        if window_title != ui_title: # 如果已经在游戏里就不用切了
            try:
                activate_window_force(window_title)
                time.sleep(0.35) # 等待弹出动画
            except Exception as e:
                print(f"[Capture Warning] Activate game failed: {e}")

        # 4. 📸 [Snap] 截图
        rect = find_window_rect(window_title)
        bgr = grab_region_bgr(rect.left, rect.top, rect.width, rect.height)
        
        if bgr is None:
            raise HTTPException(500, "Capture returned None")

        # 5. 💾 [Save] 保存
        temp_path = os.path.join(TEMP_DIR, "picker_preview.jpg")
        cv2.imwrite(temp_path, bgr, [cv2.IMWRITE_JPEG_QUALITY, 80])
        
        # 6. 🔙 [Restore] 把焦点还给之前的 UI 窗口
        if ui_title and ui_title != window_title:
            print(f"[Capture] Restoring original window: '{ui_title}'")
            try:
                activate_window_force(ui_title)
            except Exception as e:
                print(f"[Capture Warning] Failed to restore UI: {e}")
                # 兜底：如果切回失败，尝试切硬编码的名称
                try:
                    activate_window_force("GalRec")
                except:
                    pass

        return {"ok": True, "url": f"/capture/file/picker_preview.jpg?t={time.time()}"}
        
    except Exception as e:
        print(f"[Capture Error] {e}")
        # 即使报错也要尝试切回 UI
        if ui_title:
            try: activate_window_force(ui_title)
            except: pass
        raise HTTPException(500, f"Capture failed: {str(e)}")

@router.get("/file/{filename}")
def get_temp_file(filename: str):
    path = os.path.join(TEMP_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path)