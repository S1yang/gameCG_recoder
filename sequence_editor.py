# sequence_editor.py
import os
import time
import glob
import yaml
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import mss
import numpy as np
import cv2
import json
import shutil
from ui.dpi import enable_dpi_awareness
from state import (
    set_game_root, get_game_root,
    load_progress, save_progress,
    get_task_state,
)
from ui.window import activate_window
from game_registry import GameRegistry

enable_dpi_awareness()

PROJECT_BASE = os.path.dirname(os.path.abspath(__file__))


# ---- game root from registry(active) ----
active_root = GameRegistry(PROJECT_BASE).resolve_active_root()
set_game_root(active_root)
GAME_ROOT = get_game_root()

SEQ_DIR = os.path.join(GAME_ROOT, "sequences")
TPL_DIR = os.path.join(GAME_ROOT, "templates")

os.makedirs(SEQ_DIR, exist_ok=True)
os.makedirs(TPL_DIR, exist_ok=True)



def _unique_name_in_templates(filename: str) -> str:
    """
    给定一个文件名（可含路径），返回一个在 TPL_DIR 下不会冲突的文件名。
    例如 eye.png 已存在，则返回 eye_1.png, eye_2.png ...
    """
    base = os.path.basename(filename)
    name, ext = os.path.splitext(base)
    if not ext:
        ext = ".png"
    cand = f"{name}{ext}"
    k = 1
    while os.path.exists(os.path.join(TPL_DIR, cand)):
        cand = f"{name}_{k}{ext}"
        k += 1
    return cand


def _ensure_template_in_game_templates(src_path: str, prefer_name: str | None = None) -> str:
    """
    确保 src_path 对应的图片文件在当前 game 的 templates/ 目录里。
    - 如果 src_path 已经在 TPL_DIR 内：直接返回 basename
    - 否则复制到 TPL_DIR，返回复制后的 basename
    """
    if not src_path:
        raise ValueError("empty template path")

    src_path = os.path.abspath(src_path)
    tpl_dir_abs = os.path.abspath(TPL_DIR)

    # 已在 templates/ 内：直接使用文件名
    try:
        if os.path.commonpath([src_path, tpl_dir_abs]) == tpl_dir_abs:
            return os.path.basename(src_path)
    except Exception:
        pass

    # 否则：复制进 templates/
    dst_name = _unique_name_in_templates(prefer_name or os.path.basename(src_path))
    dst_path = os.path.join(TPL_DIR, dst_name)
    os.makedirs(TPL_DIR, exist_ok=True)
    shutil.copy2(src_path, dst_path)
    return dst_name


# game-level config: prefer game.yaml; fallback to config.yaml (legacy)
CONFIG_PATH = os.path.join(GAME_ROOT, "game.yaml")
if not os.path.exists(CONFIG_PATH):
    CONFIG_PATH = os.path.join(GAME_ROOT, "config.yaml")

os.makedirs(SEQ_DIR, exist_ok=True)
os.makedirs(TPL_DIR, exist_ok=True)


def load_app_config():
    if not os.path.exists(CONFIG_PATH):
        return {}
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def save_app_config(cfg: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.safe_dump(cfg, f, allow_unicode=True, sort_keys=False)



def choose_template_file(initialdir: str = TPL_DIR, title: str = "选择模板图片") -> str | None:
    """从 templates 文件夹中选择已有模板图片（png/jpg/webp）。返回绝对路径或 None。"""
    path = filedialog.askopenfilename(
        title=title,
        initialdir=initialdir,
        filetypes=[
            ("Image files", "*.png *.jpg *.jpeg *.webp"),
            ("PNG", "*.png"),
            ("All files", "*.*"),
        ],
    )
    return path or None

def capture_roi_to_file(self, out_path: str):
    title_kw = self.var_game_title.get().strip()
    if not title_kw:
        raise RuntimeError("请先在顶部填写窗口标题关键字（用于截图前激活游戏）。")


    from ui.screen_roi import ScreenROI

    self.withdraw()
    time.sleep(0.15)

    if activate_window:
        activate_window(title_kw)
        time.sleep(0.15)

    roi = ScreenROI(self).wait()  # (x,y,w,h)
    if not roi:
        self.deiconify()
        return False

    x, y, w, h = roi
    with mss.mss() as sct:
        img = np.array(sct.grab({"left": int(x), "top": int(y), "width": int(w), "height": int(h)}))
    bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    cv2.imwrite(out_path, bgr)

    self.deiconify()
    return True


def seq_file(i: int) -> str:
    return os.path.join(SEQ_DIR, f"{i:03d}.yaml")


def list_seq_ids() -> list[int]:
    """
    List task ids.
    - If queue.yaml exists: use its order FIRST, but also append any new *.yaml found on disk.
    - Always return a de-duplicated, stable list.
    """
    # 1) scan disk
    disk_ids: list[int] = []
    for fp in glob.glob(os.path.join(SEQ_DIR, "*.yaml")):
        bn = os.path.basename(fp)
        if bn.lower().endswith(".yaml"):
            stem = bn[:-5]
            if stem.isdigit():
                disk_ids.append(int(stem))
    disk_ids = sorted(set(disk_ids))

    # 2) load queue order if any
    qpath = os.path.join(GAME_ROOT, "queue.yaml")
    order_ids: list[int] = []
    if os.path.exists(qpath):
        try:
            with open(qpath, "r", encoding="utf-8") as f:
                q = yaml.safe_load(f) or {}
            order = q.get("order", None)
            if isinstance(order, list):
                for x in order:
                    if str(x).isdigit():
                        order_ids.append(int(x))
        except Exception:
            order_ids = []

    # 3) merge: queue first + missing disk ids
    merged: list[int] = []
    seen = set()

    for x in order_ids:
        if x in seen:
            continue
        # 如果 queue 里写了一个磁盘不存在的 id，这里也保留/或你想过滤也行
        merged.append(x)
        seen.add(x)

    for x in disk_ids:
        if x in seen:
            continue
        merged.append(x)
        seen.add(x)

    # --- optional debug ---
    # print("[DBG] SEQ_DIR =", SEQ_DIR)
    # print("[DBG] queue =", order_ids)
    # print("[DBG] disk  =", disk_ids)
    # print("[DBG] merged=", merged)

    return merged



def normalize_seq(i: int, d: dict) -> dict:
    if not isinstance(d, dict):
        d = {}
    d.setdefault("id", i)
    d.setdefault("name", d.get("name") or f"CG_{i:03d}")

    entry = d.get("entry")
    if not isinstance(entry, dict):
        entry = {}
    entry.setdefault("mode", "gallery")
    entry.setdefault("template", "")
    d["entry"] = entry

    pre = d.get("preplay")
    if not isinstance(pre, dict):
        pre = {}
    actions = pre.get("actions")
    if not isinstance(actions, list):
        actions = []
    norm_actions = []
    for a in actions:
        if not isinstance(a, dict):
            continue
        tpl = a.get("template", "")
        delay = a.get("delay", 0.5)
        try:
            delay = float(delay)
        except Exception:
            delay = 0.5
        norm_actions.append({"template": str(tpl), "delay": delay})
    pre["actions"] = norm_actions
    d["preplay"] = pre

    play = d.get("play")
    if not isinstance(play, dict):
        play = {}
    play.setdefault("advance_method", "mouse_left")
    play.setdefault("pacing", "system")
    d["play"] = play

    rec = d.get("record")
    if not isinstance(rec, dict):
        rec = {}
    rec.setdefault("basename", d.get("name", f"CG_{i:03d}"))
    d["record"] = rec

    # ✅ 新增：end
    end = d.get("end")
    if not isinstance(end, dict):
        end = {}
    end.setdefault("template", "")
    d["end"] = end

    return d


def task_status_icon(st: dict) -> str:
    s = (st or {}).get("status", "")
    if s == "done":
        return "✅"
    if s == "running":
        return "⏳"
    if s == "failed":
        return "❌"
    if s == "aborted":
        return "⏸"
    return "▫"


def load_seq(i: int) -> dict:
    p = seq_file(i)
    if not os.path.exists(p):
        return normalize_seq(i, {})
    with open(p, "r", encoding="utf-8") as f:
        d = yaml.safe_load(f) or {}
    return normalize_seq(i, d)


def save_seq(i: int, d: dict):
    d = normalize_seq(i, d)
    with open(seq_file(i), "w", encoding="utf-8") as f:
        yaml.safe_dump(d, f, allow_unicode=True, sort_keys=False)




class Editor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("GalRec – CG Task Configurator (Step 1–4)")

        # print("[BOOT] Editor.__init__ called")

        # 加载config.yaml
        cfg = load_app_config()

        # —— 自适应屏幕，避免底部按钮被裁切 ——
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()

        w = min(1000, sw - 80)
        h = min(760, sh - 120)  # 给任务栏留空间
        self.geometry(f"{w}x{h}+40+40")

        # 最小尺寸，避免缩小后按钮看不到
        self.minsize(920, 700)

        # 允许拉伸
        self.resizable(True, True)

        self._basename_touched = False
        self.seq_ids: list[int] = []
        self.cur_id: int | None = None
        self.seq: dict | None = None
        self.step = 1
        self.dirty = False

        self.var_game_title = tk.StringVar(value="")
        self.var_game_title.set((cfg.get("game_window_title") or "").strip())

        self.var_name = tk.StringVar(value="")
        self.var_basename = tk.StringVar(value="")

        self.var_entry_mode = tk.StringVar(value="gallery")
        self.var_adv_method = tk.StringVar(value="mouse_left")
        self.var_pacing = tk.StringVar(value="system")
        self.var_action_delay = tk.StringVar(value="0.5")

        self._build()
        self._reload_list()
        self._select_first_or_create()

        for v in [self.var_name, self.var_basename, self.var_entry_mode, self.var_adv_method, self.var_pacing]:
            v.trace_add("write", lambda *_: self._set_dirty(True))

        self.var_name.trace_add("write", self._sync_basename_from_name)

    def _build(self):
        root = ttk.Frame(self, padding=10)
        root.pack(fill="both", expand=True)

        top = ttk.LabelFrame(root, text="游戏窗口（用于截图时前台激活）")
        top.pack(fill="x")
        ttk.Label(top, text="窗口标题关键字：").pack(side="left")
        ttk.Entry(top, textvariable=self.var_game_title, width=40).pack(side="left", padx=6)
        ttk.Label(top, text="（例：游戏名的一部分）").pack(side="left")

        body = ttk.Frame(root)
        body.pack(fill="both", expand=True, pady=10)

        left = ttk.LabelFrame(body, text="CG Tasks")
        left.pack(side="left", fill="y")

        self.lb = tk.Listbox(left, width=18, height=28)
        self.lb.pack(fill="y", padx=6, pady=6)
        self.lb.bind("<<ListboxSelect>>", self._on_task_select)

        left_btns = ttk.Frame(left)
        left_btns.pack(fill="x", padx=6, pady=(0, 6))
        ttk.Button(left_btns, text="+ New Task", command=self._new_task).pack(fill="x")
        ttk.Button(left_btns, text="Delete Task", command=self._delete_task).pack(fill="x", pady=4)
        ttk.Button(left_btns, text="Save Task", command=self._save_task).pack(fill="x")

        ttk.Separator(left_btns, orient="horizontal").pack(fill="x", pady=8)
        ttk.Button(left_btns, text="Move Up", command=self._move_task_up).pack(fill="x")
        ttk.Button(left_btns, text="Move Down", command=self._move_task_down).pack(fill="x", pady=4)
        ttk.Button(left_btns, text="Save Queue", command=self._save_queue).pack(fill="x")

        right = ttk.Frame(body)
        right.pack(side="left", fill="both", expand=True, padx=(12, 0))

        header = ttk.Frame(right)
        header.pack(fill="x")

        self.lbl_title = ttk.Label(header, text="Task", font=("Segoe UI", 12, "bold"))
        self.lbl_title.pack(side="left")

        self.lbl_dirty = ttk.Label(header, text="", foreground="#b00")
        self.lbl_dirty.pack(side="left", padx=10)

        btns = ttk.Frame(header)
        btns.pack(side="right")

        ttk.Button(btns, text="Run All", command=self._start_runner).pack(side="left", padx=4)
        ttk.Button(btns, text="Run Selected", command=self._start_runner_selected).pack(side="left", padx=4)
        ttk.Button(btns, text="Reset Status", command=self._reset_selected_status).pack(side="left", padx=4)


        common = ttk.LabelFrame(right, text="基本信息")
        common.pack(fill="x", pady=(10, 8))

        r1 = ttk.Frame(common); r1.pack(fill="x", padx=8, pady=6)
        ttk.Label(r1, text="任务名", width=10).pack(side="left")
        ttk.Entry(r1, textvariable=self.var_name).pack(side="left", fill="x", expand=True)

        r2 = ttk.Frame(common); r2.pack(fill="x", padx=8, pady=(0, 8))
        ttk.Label(r2, text="输出文件名", width=10).pack(side="left")
        basename_entry = ttk.Entry(r2, textvariable=self.var_basename)
        basename_entry.pack(side="left", fill="x", expand=True)
        basename_entry.bind("<KeyRelease>", lambda e: setattr(self, "_basename_touched", True))


        nav = ttk.Frame(right)
        nav.pack(fill="x", pady=(0, 8))
        self.btn_back = ttk.Button(nav, text="◀ Back", command=self._prev_step)
        self.btn_back.pack(side="left")
        self.btn_next = ttk.Button(nav, text="Next ▶", command=self._next_step)
        self.btn_next.pack(side="right")

        self.step_title = ttk.Label(right, text="", font=("Segoe UI", 11, "bold"))
        self.step_title.pack(anchor="w", pady=(0, 6))

        self.step_frame = ttk.Frame(right)
        self.step_frame.pack(fill="both", expand=True)

    def _reload_list(self):
        # print("[DBG] _reload_list called")
        # print("[DBG] list_seq_ids symbol =", list_seq_ids)
        # print("[DBG] list_seq_ids module =", getattr(list_seq_ids, "__module__", None))
        # print("[DBG] list_seq_ids file   =", getattr(__import__(getattr(list_seq_ids, "__module__", "")), "__file__", None))

        self.seq_ids = list_seq_ids()
        prog = load_progress()

        self.lb.delete(0, tk.END)
        for sid in self.seq_ids:
            st = get_task_state(prog, sid)

            # 展示名：progress 里有就用 progress，否则用 yaml，否则 fallback
            seq_name = (load_seq(sid).get("name") or f"CG_{sid:03d}").strip()
            name = (st.get("name") or seq_name).strip()

            icon = task_status_icon(st)  # ✅/❌/⏳/⏸/▫
            self.lb.insert(tk.END, f"{icon} {sid:03d}  {name}")


    def _select_first_or_create(self):
        if not self.seq_ids:
            self._create_task_with_id(1)
            self._reload_list()

        self.lb.selection_clear(0, tk.END)
        self.lb.selection_set(0)
        self.lb.event_generate("<<ListboxSelect>>")

    def _create_task_with_id(self, i: int):
        d = normalize_seq(i, {})
        save_seq(i, d)

    def _new_task(self):
        nid = (max(self.seq_ids) + 1) if self.seq_ids else 1
        self._create_task_with_id(nid)

        # 确保 queue.yaml 也包含新任务（否则下次启动仍可能被 queue 覆盖）
        if nid not in self.seq_ids:
            self.seq_ids.append(nid)

        self._save_queue_silent()

        self._reload_list()

        # 自动选中新建项
        if nid in self.seq_ids:
            idx = self.seq_ids.index(nid)
            self.lb.selection_clear(0, tk.END)
            self.lb.selection_set(idx)
            self.lb.see(idx)
            self.lb.event_generate("<<ListboxSelect>>")

    def _delete_task(self):
        if self.cur_id is None:
            return
        i = self.cur_id
        if not messagebox.askyesno("Delete", f"Delete task {i:03d}?\n（将删除 sequences/{i:03d}.yaml，并清理 templates/{i:03d}_*.png）"):
            return

        try:
            os.remove(seq_file(i))
        except FileNotFoundError:
            pass

        # ✅ 同步清理模板
        for fp in glob.glob(os.path.join(TPL_DIR, f"{i:03d}_*.png")):
            try:
                os.remove(fp)
            except Exception:
                pass

        prog = load_progress()
        tasks = prog.get("tasks", {}) or {}
        sid = f"{i:03d}"
        if sid in tasks:
            tasks.pop(sid, None)
            prog["tasks"] = tasks
            save_progress(prog)

        # ✅ 同步更新 queue.yaml：移除该 id
        qpath = os.path.join(GAME_ROOT, "queue.yaml")
        if os.path.exists(qpath):
            try:
                with open(qpath, "r", encoding="utf-8") as f:
                    q = yaml.safe_load(f) or {}
                order = q.get("order", [])
                if isinstance(order, list):
                    order2 = [int(x) for x in order if str(x).isdigit() and int(x) != i]
                    q["order"] = order2
                    with open(qpath, "w", encoding="utf-8") as f:
                        yaml.safe_dump(q, f, allow_unicode=True, sort_keys=False)
            except Exception:
                pass

        self._reload_list()
        self.cur_id = None
        self.seq = None
        self._select_first_or_create()

    def _queue_path(self) -> str:
        return os.path.join(GAME_ROOT, "queue.yaml")

    def _save_queue(self):
        """Persist current task order to queue.yaml."""
        try:
            data = {"order": [int(x) for x in self.seq_ids]}
            with open(self._queue_path(), "w", encoding="utf-8") as f:
                yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
            messagebox.showinfo("Queue", "Queue saved (queue.yaml).")
        except Exception as e:
            messagebox.showerror("Queue", str(e))

    def _move_task_up(self):
        sel = self.lb.curselection()
        if not sel:
            return
        i = int(sel[0])
        if i <= 0:
            return
        self.seq_ids[i-1], self.seq_ids[i] = self.seq_ids[i], self.seq_ids[i-1]
        self._save_queue_silent()
        self._reload_list()
        self.lb.selection_set(i-1)

    def _move_task_down(self):
        sel = self.lb.curselection()
        if not sel:
            return
        i = int(sel[0])
        if i >= len(self.seq_ids) - 1:
            return
        self.seq_ids[i+1], self.seq_ids[i] = self.seq_ids[i], self.seq_ids[i+1]
        self._save_queue_silent()
        self._reload_list()
        self.lb.selection_set(i+1)

    def _save_queue_silent(self):
        """Save queue without popups (used for move up/down)."""
        try:
            data = {"order": [int(x) for x in self.seq_ids]}
            with open(self._queue_path(), "w", encoding="utf-8") as f:
                yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)
        except Exception:
            pass

    def _on_task_select(self, _=None):
        sel = self.lb.curselection()
        if not sel:
            return
        idx = sel[0]
        i = self.seq_ids[idx]
        if self.dirty and self.cur_id is not None:
            if messagebox.askyesno("Unsaved", "当前任务有未保存修改，是否先保存？"):
                self._save_task()
            else:
                self._set_dirty(False)
        self._load_task(i)

    def _load_task(self, i: int):
        self.cur_id = i
        self.seq = load_seq(i)
        self.step = 1

        self._basename_touched = False
        
        self.var_name.set(self.seq.get("name", f"CG_{i:03d}"))
        self.var_basename.set(self.seq.get("record", {}).get("basename", self.var_name.get()))
        self.var_entry_mode.set(self.seq.get("entry", {}).get("mode", "gallery"))
        self.var_adv_method.set(self.seq.get("play", {}).get("advance_method", "mouse_left"))
        self.var_pacing.set(self.seq.get("play", {}).get("pacing", "system"))

        self._set_dirty(False)
        self._render_step()

    def _save_task(self):
        if self.cur_id is None or self.seq is None:
            return
        i = self.cur_id

        self.seq["name"] = self.var_name.get().strip() or f"CG_{i:03d}"
        self.seq.setdefault("record", {})["basename"] = self.var_basename.get().strip() or self.seq["name"]
        self.seq.setdefault("entry", {})["mode"] = self.var_entry_mode.get()
        self.seq.setdefault("play", {})["advance_method"] = self.var_adv_method.get()
        self.seq.setdefault("play", {})["pacing"] = self.var_pacing.get()

        save_seq(i, self.seq)

        cfg = load_app_config()
        cfg["game_window_title"] = (self.var_game_title.get() or "").strip()
        save_app_config(cfg)

        self._set_dirty(False)
        self._reload_list()
        messagebox.showinfo("Saved", f"Saved: {os.path.basename(SEQ_DIR)}/{i:03d}.yaml")

    def _set_dirty(self, dirty: bool):
        self.dirty = dirty
        self.lbl_dirty.config(text="* 未保存" if dirty else "")
        if self.cur_id is None:
            self.lbl_title.config(text="No task")
        else:
            self.lbl_title.config(text=f"Task {self.cur_id:03d}")

    def _prev_step(self):
        if self.step > 1:
            self.step -= 1
            self._render_step()

    def _next_step(self):
        if self.step < 4:
            self.step += 1
            self._render_step()

    def _render_step(self):
        for w in self.step_frame.winfo_children():
            w.destroy()

        self.btn_back.config(state=("normal" if self.step > 1 else "disabled"))
        self.btn_next.config(state=("normal" if self.step < 4 else "disabled"))

        if self.seq is None:
            return

        if self.step == 1:
            self._render_step1()
        elif self.step == 2:
            self._render_step2()
        elif self.step == 3:
            self._render_step3()
        elif self.step == 4:
            self._render_step4()

    def _render_step1(self):
        self.step_title.config(text="Step 1 / 4 — Enter CG")

        box = ttk.LabelFrame(self.step_frame, text="入口方式")
        box.pack(fill="x", pady=10, padx=4)

        ttk.Radiobutton(box, text="From Gallery", variable=self.var_entry_mode, value="gallery").pack(anchor="w", padx=10, pady=6)
        ttk.Radiobutton(box, text="From Free Roam Scene", variable=self.var_entry_mode, value="roam").pack(anchor="w", padx=10, pady=6)

        cap = ttk.LabelFrame(self.step_frame, text="入口按钮模板（用于自动点进该 CG）")
        cap.pack(fill="x", padx=4, pady=10)

        i = self.cur_id
        tpl_bn = self.seq.get("entry", {}).get("template", "")
        has_entry = os.path.exists(os.path.join(TPL_DIR, tpl_bn)) if tpl_bn else False

        ttk.Label(cap, text=("✅ 已配置" if has_entry else "❌ 未配置")).pack(side="left", padx=10, pady=8)

        btns = ttk.Frame(cap)
        btns.pack(side="right", padx=10, pady=8)

        def do_capture_entry():
            try:
                # capture 固定存入 templates/{id}_entry.png
                entry_path = os.path.join(TPL_DIR, f"{i:03d}_entry.png")
                ok = capture_roi_to_file(self, entry_path)
                if ok:
                    self.seq.setdefault("entry", {})["template"] = os.path.basename(entry_path)  # ✅ 只存 basename
                    self._set_dirty(True)
                    messagebox.showinfo("Captured", f"Saved entry template:\n{entry_path}")
                    self._render_step()
            except Exception as e:
                messagebox.showerror("Capture error", str(e))


        def do_choose_entry():
            try:
                p = choose_template_file(title="选择 Entry 模板（从 templates 复用）")
                if not p:
                    return
                bn = _ensure_template_in_game_templates(p, prefer_name=f"{i:03d}_entry.png")
                self.seq.setdefault("entry", {})["template"] = bn  # ✅ 只存 basename
                self._set_dirty(True)
                self._render_step()
            except Exception as e:
                messagebox.showerror("Choose error", str(e))


        ttk.Button(btns, text="Capture Entry (ROI)", command=do_capture_entry).pack(side="left", padx=(0, 8))
        ttk.Button(btns, text="Choose Entry (templates)", command=do_choose_entry).pack(side="left")
        ttk.Label(self.step_frame, text="说明：此模板用于阶段A自动识别并点击入口按钮中心。").pack(anchor="w", padx=6, pady=6)

    def _render_step2(self):
        self.step_title.config(text="Step 2 / 4 — Pre-play Setup（CG 独有，顺序执行）")

        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])

        top = ttk.Frame(self.step_frame)
        top.pack(fill="x", padx=4, pady=6)

        self.lb_actions = tk.Listbox(top, height=10)
        self.lb_actions.pack(side="left", fill="both", expand=True)
        self.lb_actions.bind("<<ListboxSelect>>", self._on_action_select)

        right = ttk.Frame(top)
        right.pack(side="left", fill="y", padx=(10, 0))

        ttk.Button(right, text="+ Add Action (capture)", command=self._add_action_capture).pack(fill="x")
        ttk.Button(right, text="+ Add Action (choose)", command=self._add_action_choose).pack(fill="x", pady=(6, 0))
        ttk.Button(right, text="Delete Selected", command=self._delete_action).pack(fill="x", pady=4)
        ttk.Button(right, text="Move Up", command=lambda: self._move_action(-1)).pack(fill="x")
        ttk.Button(right, text="Move Down", command=lambda: self._move_action(+1)).pack(fill="x", pady=(4, 0))

        delay_box = ttk.LabelFrame(self.step_frame, text="选中 Action 的 Delay（秒）")
        delay_box.pack(fill="x", padx=4, pady=10)

        r = ttk.Frame(delay_box); r.pack(fill="x", padx=8, pady=8)
        ttk.Label(r, text="Delay").pack(side="left")
        ttk.Entry(r, textvariable=self.var_action_delay, width=10).pack(side="left", padx=8)
        ttk.Button(r, text="Apply to selected", command=self._apply_action_delay).pack(side="left")

        ttk.Label(self.step_frame, text="提示：本阶段禁止推进剧情；仅做“截图按钮→等待→点击”的准备动作。").pack(anchor="w", padx=6, pady=6)

        self._refresh_actions_list()

    def _refresh_actions_list(self):
        if self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        self.lb_actions.delete(0, tk.END)
        for i, a in enumerate(actions):
            tpl = os.path.basename(a.get("template", "")) if a.get("template") else "(no template)"
            self.lb_actions.insert(tk.END, f"{i+1:02d}  delay={a.get('delay',0.5):.2f}s  {tpl}")

    def _on_action_select(self, _=None):
        if self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        sel = self.lb_actions.curselection()
        if not sel:
            return
        idx = sel[0]
        if 0 <= idx < len(actions):
            self.var_action_delay.set(str(actions[idx].get("delay", 0.5)))

    def _add_action_capture(self):
        if self.cur_id is None or self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        idx = len(actions) + 1
        out_path = os.path.join(TPL_DIR, f"{self.cur_id:03d}_pre_{idx:02d}.png")

        try:
            ok = capture_roi_to_file(self, out_path)
            if not ok:
                return
            actions.append({"template": os.path.basename(out_path), "delay": 0.5})
            self._set_dirty(True)
            self._refresh_actions_list()
        except Exception as e:
            messagebox.showerror("Capture error", str(e))

    def _add_action_choose(self):
        if self.cur_id is None or self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        try:
            p = choose_template_file(title="选择 Action 模板（从 templates 复用）")
            if not p:
                return
            idx = len(actions) + 1
            bn = _ensure_template_in_game_templates(p, prefer_name=f"{self.cur_id:03d}_pre_{idx:02d}.png")
            actions.append({"template": bn, "delay": 0.5})
            self._set_dirty(True)
            self._refresh_actions_list()
        except Exception as e:
            messagebox.showerror("Choose error", str(e))

    def _delete_action(self):
        if self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        sel = self.lb_actions.curselection()
        if not sel:
            return
        idx = sel[0]
        if 0 <= idx < len(actions):
            actions.pop(idx)
            self._set_dirty(True)
            self._refresh_actions_list()

    def _move_action(self, delta: int):
        if self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        sel = self.lb_actions.curselection()
        if not sel:
            return
        i = sel[0]
        j = i + delta
        if j < 0 or j >= len(actions):
            return
        actions[i], actions[j] = actions[j], actions[i]
        self._set_dirty(True)
        self._refresh_actions_list()
        self.lb_actions.selection_clear(0, tk.END)
        self.lb_actions.selection_set(j)

    def _apply_action_delay(self):
        if self.seq is None:
            return
        actions = self.seq.setdefault("preplay", {}).setdefault("actions", [])
        sel = self.lb_actions.curselection()
        if not sel:
            return
        idx = sel[0]
        try:
            d = float(self.var_action_delay.get())
        except Exception:
            messagebox.showerror("Error", "Delay 必须是数字。")
            return
        if 0 <= idx < len(actions):
            actions[idx]["delay"] = max(0.0, d)
            self._set_dirty(True)
            self._refresh_actions_list()
            self.lb_actions.selection_clear(0, tk.END)
            self.lb_actions.selection_set(idx)

    def _render_step3(self):
        self.step_title.config(text="Step 3 / 4 — Play CG")

        box = ttk.LabelFrame(self.step_frame, text="推进方式")
        box.pack(fill="x", pady=10, padx=4)

        ttk.Radiobutton(box, text="Mouse Left Click", variable=self.var_adv_method, value="mouse_left").pack(anchor="w", padx=10, pady=6)
        ttk.Radiobutton(box, text="Key (enter/space/...) — configured in config.yaml", variable=self.var_adv_method, value="enter").pack(anchor="w", padx=10, pady=6)

        pbox = ttk.LabelFrame(self.step_frame, text="推进节奏")
        pbox.pack(fill="x", pady=10, padx=4)

        ttk.Radiobutton(pbox, text="System (recommended)", variable=self.var_pacing, value="system").pack(anchor="w", padx=10, pady=6)
        ttk.Radiobutton(pbox, text="Audio-driven (experimental)", variable=self.var_pacing, value="audio").pack(anchor="w", padx=10, pady=6)

        ttk.Label(self.step_frame, text="说明：推进键（enter/space/z/...）请在 config.yaml 的 ui.advance_key 配置。").pack(anchor="w", padx=6, pady=6)

    def _render_step4(self):
        self.step_title.config(text="Step 4 / 4 — End Detection（结束画面模板）")

        cap = ttk.LabelFrame(self.step_frame, text="结束画面模板（回到该画面 => 录制结束）")
        cap.pack(fill="x", padx=4, pady=10)

        i = self.cur_id
        end_bn = (self.seq.get("end", {}) or {}).get("template", "").strip()
        has_end = bool(end_bn) and os.path.exists(os.path.join(TPL_DIR, end_bn))

        ttk.Label(cap, text=("✅ 已配置" if has_end else "❌ 未配置")).pack(side="left", padx=10, pady=8)
        
        end_path = os.path.join(TPL_DIR, f"{i:03d}_end.png")

        def do_capture_end():
            try:
                ok = capture_roi_to_file(self, end_path)
                if ok:
                    self.seq.setdefault("end", {})["template"] = os.path.basename(end_path)
                    self._set_dirty(True)
                    messagebox.showinfo("Captured", f"Saved end template:\n{end_path}")
                    self._render_step()
            except Exception as e:
                messagebox.showerror("Capture error", str(e))

        btns = ttk.Frame(cap)
        btns.pack(side="right", padx=10, pady=8)

        ttk.Button(btns, text="Capture End (ROI)", command=do_capture_end).pack(side="left", padx=(0, 8))

        def do_choose_end():
            try:
                p = choose_template_file(title="选择 End 模板（从 templates 复用）")
                if not p:
                    return
                bn = _ensure_template_in_game_templates(p, prefer_name=f"{i:03d}_end.png")
                self.seq.setdefault("end", {})["template"] = bn
                self._set_dirty(True)
                self._render_step()
            except Exception as e:
                messagebox.showerror("Choose error", str(e))

        ttk.Button(btns, text="Choose End (templates)", command=do_choose_end).pack(side="left")

        ttk.Label(self.step_frame, text="建议：截取“返回 Gallery 后稳定存在的区域”（例如左侧菜单/标题栏/缩略图区域），小而稳定会更准。").pack(anchor="w", padx=6, pady=6)

    def _sync_basename_from_name(self, *_):
        if not self._basename_touched:
            self.var_basename.set((self.var_name.get() or "").strip())

    def _start_runner(self):

        # 1) 必须有窗口标题
        title_kw = (self.var_game_title.get() or "").strip()
        if not title_kw:
            messagebox.showerror("Missing", "请先填写【窗口标题关键字】（用于定位游戏窗口）。")
            return
        
        # 2) 保存当前任务（避免跑旧配置）
        if self.dirty:
            if messagebox.askyesno("Save", "检测到未保存修改，是否先保存再开始？"):
                self._save_task()
            else:
                return  # 不保存就不跑，避免混乱

        # 3) 把窗口标题写回 config（保证 runner 读到的是最新的）
        try:
            cfg = load_app_config()
            cfg["game_window_title"] = title_kw
            save_app_config(cfg)
        except Exception as e:
            messagebox.showerror("Config Error", f"写入 config.yaml 失败：{e}")
            return

        # 4) 隐藏 UI（避免挡住游戏）
        self.withdraw()
        self.update_idletasks()
        time.sleep(0.2)

        # 5) 激活游戏窗口到前台
        try:
            activate_window(title_kw)
        except Exception as e:
            # 激活失败也要把 UI 弹回来
            self.deiconify()
            self.lift()
            self.update_idletasks()
            messagebox.showerror("Window Error", f"未能激活游戏窗口：{e}")
            return

        # （可选）倒计时，给你切回游戏窗口的时间
        try:
            for i in range(3, 0, -1):
                print(f"[UI] Starting in {i}...")
                time.sleep(1.0)

            from runner import run_all_sequences
            run_all_sequences()
        except Exception as e:
            messagebox.showerror("Runner Error", str(e))
        finally:
            # ✅ 无论成功失败都恢复 UI
            self.deiconify()
            self.lift()
            self.update_idletasks()
            self._reload_list()

    def _current_selected_id(self) -> int | None:
        sel = self.lb.curselection()
        if not sel:
            return None
        idx = sel[0]
        if idx < 0 or idx >= len(self.seq_ids):
            return None
        return self.seq_ids[idx]

    def _start_runner_selected(self):
        sid = self._current_selected_id()
        if sid is None:
            messagebox.showinfo("Info", "请先在左侧选择一个任务。")
            return

        # 保存当前任务
        if self.dirty:
            if messagebox.askyesno("Save", "检测到未保存修改，是否先保存再开始？"):
                self._save_task()

        # 写入 progress.json：只跑这个任务（runner 里需要支持 allowlist；你如果还没加，我也给你最小改法）
        prog = load_progress()
        prog["run_only"] = [f"{sid:03d}"]
        save_progress(prog)

        self._start_runner()

    def _reset_selected_status(self):
        sid = self._current_selected_id()
        if sid is None:
            messagebox.showinfo("Info", "请先选择一个任务。")
            return
        prog = load_progress()
        tasks = prog.get("tasks", {}) or {}
        tasks.pop(f"{sid:03d}", None)
        prog["tasks"] = tasks
        save_progress(prog)
        self._reload_list()


if __name__ == "__main__":
    Editor().mainloop()