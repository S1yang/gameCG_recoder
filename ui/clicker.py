# ui/clicker.py
import time

# 用 pydirectinput 替代 pyautogui 来对付部分游戏的 DirectInput/RawInput
import pydirectinput as pdi

from ui.window import Rect, abs_from_rel

# 建议：pydirectinput 默认 pause 很小，这里我们自己控制节奏
pdi.PAUSE = 0.0

def click_rel(rect: Rect, rx: float, ry: float, interval: float = 0.18):
    """
    相对窗口坐标点击（0~1），内部做成更“像真人”的 mouseDown/mouseUp。
    interval: 每次点击后的延迟，建议 0.18~0.30
    """
    if rect.width <= 10 or rect.height <= 10:
        raise RuntimeError(
            f"窗口尺寸异常：{rect.width}x{rect.height}。请确认游戏窗口未最小化/未异常。"
        )

    x, y = abs_from_rel(rect, rx, ry)

    # 更像真人：移动(很短) + 按下 + 抬起 + 延迟
    pdi.moveTo(x, y)
    time.sleep(0.03)
    pdi.mouseDown(button="left")
    time.sleep(0.03)
    pdi.mouseUp(button="left")

    time.sleep(interval)

def press_key(key_name: str, interval: float = 0.18, duration: float = 0.05):
    """
    按键推进。
    关键修复：增加 duration (按住时长)，防止游戏帧率低时检测不到按键。
    """
    try:
        pdi.keyDown(key_name)
        time.sleep(duration) # 保持按住状态至少 50ms
        pdi.keyUp(key_name)
    except Exception:
        # fallback: 有些特殊键名 pydirectinput 可能报错，尝试普通 press
        pdi.press(key_name)
    
    time.sleep(interval)

def advance(rect: Rect, method: str, rx: float, ry: float, interval: float = 0.18):
    """
    method: mouse_left | enter | space
    rx, ry: 相对坐标，仅 mouse_left 用到
    """
    if method == "mouse_left":
        click_rel(rect, rx, ry, interval=interval)
    elif method == "enter":
        press_key("enter", interval=interval)
    elif method == "space":
        press_key("space", interval=interval)
    else:
        # 允许直接传键名，如 'z', 'ctrl' 等
        press_key(method, interval=interval)