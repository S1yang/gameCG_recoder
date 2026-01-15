# ui/screen_roi.py
import tkinter as tk

class ScreenROI:
    """
    全屏 topmost 透明遮罩，鼠标拖拽选择 ROI。
    选择完成后返回 (x, y, w, h)（屏幕坐标）。
    ESC 取消。
    """
    def __init__(self, parent=None):
        self.parent = parent
        self._result = None

        self.top = tk.Toplevel(parent) if parent else tk.Tk()
        self.top.withdraw()
        self.top.overrideredirect(True)
        self.top.attributes("-topmost", True)

        # 全屏尺寸
        self.sw = self.top.winfo_screenwidth()
        self.sh = self.top.winfo_screenheight()
        self.top.geometry(f"{self.sw}x{self.sh}+0+0")

        # 半透明遮罩（alpha 需要 top 显示后设置更稳定）
        self.canvas = tk.Canvas(self.top, cursor="cross", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)

        self.x0 = self.y0 = 0
        self.rect_id = None

        self.top.bind("<Escape>", self._cancel)
        self.canvas.bind("<ButtonPress-1>", self._down)
        self.canvas.bind("<B1-Motion>", self._move)
        self.canvas.bind("<ButtonRelease-1>", self._up)

    def wait(self):
        # show
        self.top.deiconify()
        try:
            self.top.attributes("-alpha", 0.25)
        except Exception:
            pass
        self.canvas.configure(bg="black")

        # 提示文字
        self.canvas.create_text(
            self.sw // 2, 40,
            text="Drag to select ROI. Release to confirm. Press ESC to cancel.",
            fill="white",
            font=("Segoe UI", 14, "bold")
        )

        self.top.grab_set()
        self.top.focus_force()
        self.top.wait_window()
        return self._result

    def _down(self, e):
        self.x0, self.y0 = e.x, e.y
        if self.rect_id:
            self.canvas.delete(self.rect_id)
        self.rect_id = self.canvas.create_rectangle(self.x0, self.y0, self.x0, self.y0, outline="red", width=2)

    def _move(self, e):
        if not self.rect_id:
            return
        self.canvas.coords(self.rect_id, self.x0, self.y0, e.x, e.y)

    def _up(self, e):
        x1, y1 = e.x, e.y
        x0, y0 = self.x0, self.y0
        x = min(x0, x1)
        y = min(y0, y1)
        w = abs(x1 - x0)
        h = abs(y1 - y0)
        if w < 4 or h < 4:
            self._result = None
        else:
            self._result = (x, y, w, h)
        self._close()

    def _cancel(self, _=None):
        self._result = None
        self._close()

    def _close(self):
        try:
            self.top.grab_release()
        except Exception:
            pass
        self.top.destroy()
