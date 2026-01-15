# obs/recorder.py
import os
import time
import glob
import shutil
from obsws_python import ReqClient


class OBSRecorder:
    """
    设计目标：
    - 不要求你把 OBS 的 Recording Path 指向 ./output/raw
    - 直接从 OBS 获取本次录制的 outputPath，然后移动/重命名到 output/final
    """

    def __init__(
        self,
        host="127.0.0.1",
        port=4455,
        password="",
        output_raw_dir="./output/raw",   # 兼容保留：作为 fallback 扫描用
        output_final_dir="./output/final",
    ):
        self.obs = ReqClient(host=host, port=port, password=password)

        self.output_raw_dir = os.path.abspath(output_raw_dir)
        self.output_final_dir = os.path.abspath(output_final_dir)
        os.makedirs(self.output_raw_dir, exist_ok=True)
        os.makedirs(self.output_final_dir, exist_ok=True)

        self._last_output_path = None  # stop 后缓存本次录制文件路径

    # ---------- OBS control ----------

    def start(self):
        self._last_output_path = None
        self.obs.start_record()

    def stop(self):
        self.obs.stop_record()

    def wait_stopped(self, timeout=20.0):
        t0 = time.time()
        while time.time() - t0 < timeout:
            st = self.obs.get_record_status()
            if not getattr(st, "output_active", False):
                # 尝试缓存本次录制输出路径（不同版本字段名可能不同）
                self._last_output_path = (
                    getattr(st, "output_path", None)
                    or getattr(st, "outputPath", None)
                    or getattr(st, "output_path", None)
                )
                return True
            time.sleep(0.2)
        return False

    # ---------- path helpers ----------

    def _get_record_directory(self):
        """
        获取 OBS 设置里的录制目录（Recording Path）。
        obs-websocket 5.x 一般提供 GetRecordDirectory。
        """
        try:
            d = self.obs.get_record_directory()
            return getattr(d, "record_directory", None) or getattr(d, "recordDirectory", None)
        except Exception:
            return None

    def _latest_file_in_dir(self, folder: str, exts=("mkv", "mp4", "mov")):
        if not folder or not os.path.isdir(folder):
            return None
        files = []
        for ext in exts:
            files += glob.glob(os.path.join(folder, f"*.{ext}"))
        if not files:
            return None
        files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return files[0]

    def _wait_file_stable(self, path: str, wait_file=12.0):
        """
        等待文件存在且写入稳定（大小不再变化）
        """
        t0 = time.time()
        while time.time() - t0 < wait_file:
            if path and os.path.exists(path):
                s1 = os.path.getsize(path)
                time.sleep(0.35)
                s2 = os.path.getsize(path)
                if s2 == s1 and s2 > 0:
                    return True
            time.sleep(0.2)
        return False

    # ---------- public: move/rename ----------

    def rename_latest(self, target_basename: str, wait_file=12.0):
        """
        把“本次录制文件”移动/重命名到 output/final 目录。
        - 优先使用 OBS 返回的 outputPath
        - 若拿不到，则 fallback：从 OBS 的 Recording Path 找最新文件
        - 再不行才 fallback：扫描 output/raw
        """
        src = None

        # 1) 优先：上一次 wait_stopped() 缓存的 outputPath
        if self._last_output_path and isinstance(self._last_output_path, str):
            if self._wait_file_stable(self._last_output_path, wait_file=wait_file):
                src = self._last_output_path

        # 2) fallback：去 OBS recording directory 找最新文件
        if not src:
            rec_dir = self._get_record_directory()
            if rec_dir:
                cand = self._latest_file_in_dir(rec_dir)
                if cand and self._wait_file_stable(cand, wait_file=wait_file):
                    src = cand

        # 3) fallback：扫描你项目的 output/raw（兼容旧逻辑）
        if not src:
            cand = self._latest_file_in_dir(self.output_raw_dir)
            if cand and self._wait_file_stable(cand, wait_file=wait_file):
                src = cand

        if not src:
            raise RuntimeError(
                "未找到本次录制文件。\n"
                "请检查：OBS 是否真的开始/结束了录制；以及 obs-websocket 是否有权限返回 outputPath。"
            )

        ext = os.path.splitext(src)[1].lower()
        dst = os.path.join(self.output_final_dir, f"{target_basename}{ext}")

        if os.path.exists(dst):
            raise FileExistsError(f"目标文件已存在：{dst}")

        # ✅ move：跨盘符也能工作（os.rename 跨盘符会失败）
        shutil.move(src, dst)
        return dst
