# tools/capture_template.py
import os,sys
import cv2
import numpy as np
import pyautogui

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from ui.window import find_window_rect
from ui.capture import grab_region_bgr

def grab_window_bgr(rect):
    return grab_region_bgr(rect.left, rect.top, rect.width, rect.height)

def main():
    title_kw = input("窗口标题关键字（例如游戏名的一部分）：").strip()
    if not title_kw:
        print("Empty title keyword.")
        return

    out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
    os.makedirs(out_dir, exist_ok=True)

    name = input("模板名（例如 entry_001）：").strip() or "entry_001"
    out_path = os.path.join(out_dir, f"{name}.png")

    rect = find_window_rect(title_kw)
    img = grab_window_bgr(rect)

    # OpenCV 原生交互框选
    cv2.namedWindow("Select ROI (ENTER/SPACE to confirm, C to cancel)", cv2.WINDOW_NORMAL)
    cv2.imshow("Select ROI (ENTER/SPACE to confirm, C to cancel)", img)

    roi = cv2.selectROI("Select ROI (ENTER/SPACE to confirm, C to cancel)", img, showCrosshair=True, fromCenter=False)
    x, y, w, h = roi
    cv2.destroyAllWindows()

    if w <= 0 or h <= 0:
        print("Canceled or empty ROI.")
        return

    tmpl = img[int(y):int(y+h), int(x):int(x+w)].copy()
    cv2.imwrite(out_path, tmpl)
    print(f"[OK] saved template: {out_path}")
    print(f"ROI in window pixels: x={x}, y={y}, w={w}, h={h}")

if __name__ == "__main__":
    main()
