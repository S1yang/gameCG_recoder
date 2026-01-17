# ui/window.py
from __future__ import annotations
from dataclasses import dataclass
import time
import ctypes
import sys


import win32con
import win32process
import win32gui

# ---------------- DPI awareness ----------------
def set_dpi_awareness():
    """
    让进程进入 DPI aware，避免缩放导致坐标错位。
    """
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # PER_MONITOR_AWARE
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass

# ---------------- Rect & coord utils ----------------
@dataclass
class Rect:
    left: int
    top: int
    width: int
    height: int

def abs_from_rel(rect: Rect, rx: float, ry: float) -> tuple[int, int]:
    """
    相对坐标(0~1) -> 屏幕绝对像素坐标
    """
    x = rect.left + int(rx * rect.width)
    y = rect.top + int(ry * rect.height)
    return x, y

def rel_from_abs(rect: Rect, x: int, y: int) -> tuple[float, float]:
    """
    屏幕绝对像素坐标 -> 相对坐标(0~1)
    """
    rx = (x - rect.left) / max(1, rect.width)
    ry = (y - rect.top) / max(1, rect.height)
    # clamp
    rx = min(1.0, max(0.0, rx))
    ry = min(1.0, max(0.0, ry))
    return rx, ry

# ---------------- window find/activate ----------------
def _find_hwnd(title_keyword: str) -> int:
    set_dpi_awareness()
    kw_raw = title_keyword.strip()
    kw = kw_raw.lower()
    if not kw:
        raise RuntimeError("窗口标题关键字为空。")

    candidates = []

    def enum_handler(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd) or ""
        t = title.lower()
        if kw in t:
            try:
                l, top, r, b = win32gui.GetWindowRect(hwnd)
                w = max(0, r - l)
                h = max(0, b - top)
                area = w * h
            except Exception:
                area = 0
            candidates.append((hwnd, title, t, area))

    win32gui.EnumWindows(enum_handler, None)

    if not candidates:
        raise RuntimeError(f"找不到包含关键字的窗口：{title_keyword}")

    # 1) 过滤掉明显的非目标窗口（可按你需求增删）
    blacklist = ["cmd", "命令提示符", "powershell", "windows terminal", "explorer", "everything"]
    filtered = []
    for hwnd, title, t, area in candidates:
        if any(bad in t for bad in blacklist):
            continue
        filtered.append((hwnd, title, t, area))
    if filtered:
        candidates = filtered

    # 2) 最优先：标题“完全等于”关键字（忽略大小写）
    exact = [c for c in candidates if c[2] == kw]
    if exact:
        # exact 里也可能有多个，取面积最大的
        exact.sort(key=lambda x: x[3], reverse=True)
        return exact[0][0]

    # 3) 否则：取面积最大的（最像主窗口）
    candidates.sort(key=lambda x: x[3], reverse=True)
    return candidates[0][0]

def find_window_rect(title_keyword: str) -> Rect:
    """
    返回窗口在屏幕上的物理像素坐标（含边框/标题栏）
    """
    hwnd = _find_hwnd(title_keyword)
    l, t, r, b = win32gui.GetWindowRect(hwnd)
    return Rect(left=int(l), top=int(t), width=int(r - l), height=int(b - t))

def activate_window(title_keyword: str) -> int:
    """
    将窗口拉到前台并恢复（如果最小化）
    """
    hwnd = _find_hwnd(title_keyword)
    win32gui.ShowWindow(hwnd, 9)  # SW_RESTORE
    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.15)
    return hwnd


def activate_window_force(title_kw: str, retry: int = 3, sleep_ms: int = 80):
    """
    更稳的激活：AttachThreadInput + ShowWindow + SetForegroundWindow
    仍可能被系统策略拦，但成功率远高于裸 SetForegroundWindow。
    """
    if not sys.platform.startswith("win"):
        # 其他平台走你原来的逻辑
        return activate_window(title_kw)

    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    # 你已有的 find_window_rect 里肯定能拿到 hwnd；
    # 这里假设你已有一个函数能按标题关键字找 hwnd。
    hwnd = _find_hwnd(title_kw)  
    if not hwnd:
        raise RuntimeError(f"window not found for keyword: {title_kw}")

    SW_RESTORE = 9

    def _try_once():
        # restore / show
        user32.ShowWindow(hwnd, SW_RESTORE)
        user32.BringWindowToTop(hwnd)

        fg = user32.GetForegroundWindow()
        fg_tid = user32.GetWindowThreadProcessId(fg, None)
        cur_tid = kernel32.GetCurrentThreadId()
        target_tid = user32.GetWindowThreadProcessId(hwnd, None)

        # attach input threads
        user32.AttachThreadInput(cur_tid, fg_tid, True)
        user32.AttachThreadInput(cur_tid, target_tid, True)

        user32.SetForegroundWindow(hwnd)
        user32.SetActiveWindow(hwnd)
        user32.SetFocus(hwnd)

        # detach
        user32.AttachThreadInput(cur_tid, fg_tid, False)
        user32.AttachThreadInput(cur_tid, target_tid, False)

        # verify
        return user32.GetForegroundWindow() == hwnd

    ok = False
    last_err = None
    for _ in range(max(1, retry)):
        try:
            ok = _try_once()
            if ok:
                return True
            time.sleep(sleep_ms / 1000.0)
        except Exception as e:
            last_err = e
            time.sleep(sleep_ms / 1000.0)

    if not ok:
        raise RuntimeError(f"SetForegroundWindow denied (force failed). last_err={last_err}")