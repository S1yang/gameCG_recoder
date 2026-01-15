# tools/test_capture.py
import os, sys, time
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

import cv2
from ui.window import find_window_rect
from ui.capture import grab_region_bgr

def main():
    title_kw = input("窗口标题关键字：").strip()
    rect = find_window_rect(title_kw)
    img = grab_region_bgr(rect.left, rect.top, rect.width, rect.height)
    out = os.path.join(BASE_DIR, "debug_capture.png")
    cv2.imwrite(out, img)
    print("saved:", out)

if __name__ == "__main__":
    main()
