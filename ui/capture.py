# ui/capture.py
import numpy as np
import cv2
import mss

def grab_region_bgr(left: int, top: int, width: int, height: int):
    with mss.mss() as sct:
        mon = {"left": int(left), "top": int(top), "width": int(width), "height": int(height)}
        img = np.array(sct.grab(mon))
    return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
