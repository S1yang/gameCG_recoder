# ui/dpi.py
import ctypes

def set_dpi_awareness():
    """
    让进程进入 DPI Aware 模式，避免 Windows 缩放导致坐标错位。
    必须在任何窗口/截图/坐标获取之前调用。
    """
    try:
        # Windows 8.1+：PER_MONITOR_AWARE_V2 (2)
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            # 兼容旧系统
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def enable_dpi_awareness():
    """
    让进程 DPI aware，解决 Win 125%/150% 缩放导致的：
    - Tk 全屏 overlay 不满屏
    - ROI 坐标与 mss 截图不一致
    """
    try:
        # Windows 8.1+：PER_MONITOR_AWARE_V2(=2)
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except Exception:
        pass

    try:
        # Windows Vista+ fallback
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass