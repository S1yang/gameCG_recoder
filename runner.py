# runner.py
import os
import json
import time
import glob
import ctypes  # ✅ 用于监听键盘
from threading import Event, Thread
from typing import Optional, Callable, Dict, Any, Tuple

import yaml
import cv2
import numpy as np
import pyautogui  # 仅用于 FAILSAFE

from ui.window import find_window_rect, activate_window
from ui.clicker import advance
from ui.capture import grab_region_bgr
from obs.recorder import OBSRecorder
from state import load_progress, set_task_state, save_progress, set_game_root, get_game_root
from game_registry import GameRegistry

_LAST_HIT = {}

try:
    from ui.dpi import enable_dpi_awareness
    enable_dpi_awareness()
except Exception:
    pass

PROJECT_BASE = os.path.dirname(os.path.abspath(__file__))

# ---- game root resolution ----
env_root = os.environ.get("GALREC_GAME_ROOT", "").strip()
if env_root:
    set_game_root(env_root)

cur_root = os.path.abspath(get_game_root())
if os.path.abspath(cur_root) == os.path.abspath(PROJECT_BASE):
    active_root = GameRegistry(PROJECT_BASE).resolve_active_root()
    set_game_root(active_root)

GAME_ROOT = get_game_root()
SEQ_DIR = os.path.join(GAME_ROOT, "sequences")
TPL_DIR = os.path.join(GAME_ROOT, "templates")

os.makedirs(SEQ_DIR, exist_ok=True)
os.makedirs(TPL_DIR, exist_ok=True)


# ---------- ✅ Global Hotkey (F9) Watcher ----------

def _is_key_pressed(vk_code):
    # 0x8000 mask means key is currently down
    return (ctypes.windll.user32.GetAsyncKeyState(vk_code) & 0x8000) != 0

def _watch_global_hotkey(stop_event: Event, log: Callable[[str], None]):
    """
    后台线程：监听 F9 键。一旦按下，设置 stop_event。
    """
    VK_F9 = 0x78  # Virtual Key Code for F9
    
    log("[Input] Panic Key 'F9' is active. Press F9 to STOP immediately.")
    
    while not stop_event.is_set():
        if _is_key_pressed(VK_F9):
            log("\n[STOP] Panic Key (F9) detected! Stopping runner...")
            stop_event.set()
            break
        time.sleep(0.1)


# ---------- small utils ----------

def wait_scene_changed(title_kw: str, ref_bgr, diff_thr: float, hold_hits: int, timeout_sec: float):
    t0 = time.time()
    hits = 0
    last_diff = 0.0
    while time.time() - t0 < timeout_sec:
        rect = find_window_rect(title_kw)
        cur = grab_window_bgr(rect)
        diff = mean_abs_diff(ref_bgr, cur)
        last_diff = diff
        if diff >= diff_thr:
            hits += 1
            if hits >= hold_hits:
                return True, last_diff
        else:
            hits = 0
        time.sleep(0.08)
    return False, last_diff


def click_entry_with_verify(
    title_kw: str,
    entry_tmpl_path: str,
    ref_before_enter,
    log,
    enter_thr: float,
    retries: int,
    retry_sleep: float,
    scene_change_diff_thr: float,
    scene_change_hits: int,
    scene_change_timeout: float,
    double_click: bool,
):
    for attempt in range(1, retries + 1):
        ok = click_template_in_window(
            title_kw=title_kw,
            tmpl_path=entry_tmpl_path,
            thr=enter_thr,
            retries=1,
            retry_sleep=retry_sleep,
            log=log,
        )
        if not ok:
            log(f"  [A] entry click attempt {attempt}/{retries}: template not found")
            time.sleep(retry_sleep)
            continue

        if double_click:
            click_template_in_window(title_kw, entry_tmpl_path, enter_thr, 1, retry_sleep, log)

        changed, last_diff = wait_scene_changed(
            title_kw, ref_before_enter,
            diff_thr=scene_change_diff_thr,
            hold_hits=scene_change_hits,
            timeout_sec=scene_change_timeout,
        )
        log(f"  [A] verify scene changed={changed} last_diff={last_diff:.2f}")
        if changed:
            return True

        log("  [A] seems NOT entered, retrying...")
        time.sleep(0.25)

    return False


def _clamp01(x: float, eps: float = 0.01) -> float:
    if x < eps:
        return eps
    if x > 1.0 - eps:
        return 1.0 - eps
    return x

def grab_window_bgr(rect):
    return grab_region_bgr(rect.left, rect.top, rect.width, rect.height)

def mean_abs_diff(a_bgr, b_bgr):
    if a_bgr is None or b_bgr is None:
        return 1e9
    if a_bgr.shape != b_bgr.shape:
        b_bgr = cv2.resize(b_bgr, (a_bgr.shape[1], a_bgr.shape[0]))
    d = cv2.absdiff(a_bgr, b_bgr)
    return float(d.mean())

def match_template_center(img_bgr, tmpl_bgr, threshold=0.80, center_crop=0.70, scales=None):
    if img_bgr is None or tmpl_bgr is None:
        return None

    ih, iw = img_bgr.shape[:2]
    th, tw = tmpl_bgr.shape[:2]
    if th >= ih or tw >= iw:
        return None

    if scales is None:
        scales = [0.90, 0.95, 1.00, 1.05, 1.10]

    def prep_gray(bgr):
        g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY) if len(bgr.shape) == 3 else bgr
        g = cv2.GaussianBlur(g, (3, 3), 0)
        return g

    img_g = prep_gray(img_bgr)
    tpl_g0 = prep_gray(tmpl_bgr)

    if 0 < center_crop < 1.0:
        ch = int(th * center_crop)
        cw = int(tw * center_crop)
        y0 = (th - ch) // 2
        x0 = (tw - cw) // 2
        tpl_g0 = tpl_g0[y0:y0 + ch, x0:x0 + cw]
        th2, tw2 = tpl_g0.shape[:2]
    else:
        th2, tw2 = tpl_g0.shape[:2]

    best = None

    for s in scales:
        if abs(s - 1.0) < 1e-6:
            tpl = tpl_g0
            ths, tws = th2, tw2
        else:
            tws = int(tw2 * s)
            ths = int(th2 * s)
            if tws < 8 or ths < 8:
                continue
            tpl = cv2.resize(tpl_g0, (tws, ths), interpolation=cv2.INTER_AREA)

        if ths >= ih or tws >= iw:
            continue

        res = cv2.matchTemplate(img_g, tpl, cv2.TM_CCOEFF_NORMED)
        _, maxv, _, maxloc = cv2.minMaxLoc(res)
        if best is None or maxv > best[2]:
            x, y = maxloc
            best = (x + tws // 2, y + ths // 2, float(maxv), tws, ths)

    if best is None:
        return None

    cx, cy, score, _, _ = best
    if score < threshold:
        return None
    return (cx, cy, score)


def template_exists_and_read(path: str):
    if not path:
        return None
    if not os.path.exists(path):
        return None
    return cv2.imread(path, cv2.IMREAD_COLOR)

def load_config():
    cfg_path = os.path.join(GAME_ROOT, "game.yaml")
    if not os.path.exists(cfg_path):
        cfg_path = os.path.join(GAME_ROOT, "config.yaml")
    if not os.path.exists(cfg_path):
        return {}
    with open(cfg_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def list_sequences():
    qpath = os.path.join(GAME_ROOT, "queue.yaml")
    disk_ids = []
    for fp in glob.glob(os.path.join(SEQ_DIR, "*.yaml")):
        bn = os.path.basename(fp)
        if bn.lower().endswith(".yaml"):
            stem = bn[:-5]
            if stem.isdigit():
                disk_ids.append(int(stem))
    disk_ids = sorted(set(disk_ids))

    order_ids = []
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

    merged = []
    seen = set()
    for x in order_ids:
        if x not in seen:
            merged.append(x); seen.add(x)
    for x in disk_ids:
        if x not in seen:
            merged.append(x); seen.add(x)

    items = []
    for sid in merged:
        fp = os.path.join(SEQ_DIR, f"{sid:03d}.yaml")
        if not os.path.exists(fp):
            continue
        with open(fp, "r", encoding="utf-8") as f:
            d = yaml.safe_load(f) or {}
        if isinstance(d, dict):
            d.setdefault("id", sid)
            items.append(d)

    return items


def normalize_seq(seq: dict) -> dict:
    if not isinstance(seq, dict):
        return {}

    sid = seq.get("id", 0)

    entry = seq.get("entry")
    if not isinstance(entry, dict):
        entry = {}
    entry.setdefault("mode", "gallery")
    entry.setdefault("template", "")
    seq["entry"] = entry

    pre = seq.get("preplay")
    if not isinstance(pre, dict):
        pre = {}
    acts = pre.get("actions")
    if not isinstance(acts, list):
        acts = []
    norm = []
    for a in acts:
        if not isinstance(a, dict):
            continue
        t = str(a.get("template", "")).strip()
        try:
            dly = float(a.get("delay", 0.5))
        except Exception:
            dly = 0.5
        try:
            ato = float(a.get("appear_timeout_sec", 0.0))
        except Exception:
            ato = 0.0

        item = {"template": t, "delay": dly}
        if ato > 0:
            item["appear_timeout_sec"] = ato
        norm.append(item)

    pre["actions"] = norm
    seq["preplay"] = pre

    play = seq.get("play")
    if not isinstance(play, dict):
        play = {}
    if "advance_method" not in play:
        old = (seq.get("dialogue") or {}).get("advance_method", None)
        play["advance_method"] = old if old else "mouse_left"
    play.setdefault("pacing", "system")
    play.setdefault("mode", "default")
    seq["play"] = play

    end = seq.get("end")
    if not isinstance(end, dict):
        end = {}
    end.setdefault("template", "")
    seq["end"] = end

    rec = seq.get("record")
    if not isinstance(rec, dict):
        rec = {}
    rec.setdefault("basename", seq.get("name", f"CG_{sid:03d}" if sid else "CG"))
    seq["record"] = rec

    return seq

def safe_filename(name: str) -> str:
    bad = '\\/:*?"<>|'
    s = (name or "").strip()
    for ch in bad:
        s = s.replace(ch, "_")
    s = s.replace("\n", " ").replace("\r", " ").strip()
    return s[:120] if len(s) > 120 else s


def resolve_template_path(p: str) -> str:
    if not p:
        return ""
    p = str(p).strip()

    game_root = get_game_root()
    tpl_dir = os.path.join(game_root, "templates")

    if os.path.isabs(p) and os.path.exists(p):
        return p
    cand = os.path.join(game_root, p)
    if os.path.exists(cand):
        return cand
    cand = os.path.join(tpl_dir, p)
    if os.path.exists(cand):
        return cand
    return ""

def click_template_in_window(
    title_kw: str,
    tmpl_path: str,
    thr: float,
    retries: int,
    retry_sleep: float,
    log: Callable[[str], None],
) -> bool:
    path = resolve_template_path(tmpl_path)
    if not path:
        log(f"  [TPL] missing template: {tmpl_path}")
        return False

    tmpl = template_exists_and_read(path)
    if tmpl is None:
        log(f"  [TPL] cannot read template: {path}")
        return False

    R = 160

    for r in range(retries):
        rect = find_window_rect(title_kw)
        frame = grab_window_bgr(rect)

        hit = None

        last = _LAST_HIT.get(path)
        if last is not None:
            lx, ly = last
            x0 = max(0, lx - R)
            y0 = max(0, ly - R)
            x1 = min(frame.shape[1], lx + R)
            y1 = min(frame.shape[0], ly + R)
            roi = frame[y0:y1, x0:x1]

            h = match_template_center(roi, tmpl, threshold=thr)
            if h is not None:
                cx, cy, score = h
                cx += x0
                cy += y0
                hit = (cx, cy, score)

        if hit is None:
            hit = match_template_center(frame, tmpl, threshold=thr)

        if hit is None:
            time.sleep(retry_sleep)
            continue

        cx, cy, score = hit
        _LAST_HIT[path] = (cx, cy)

        rx = _clamp01(cx / max(1, rect.width))
        ry = _clamp01(cy / max(1, rect.height))
        log(f"  [TPL] hit score={score:.3f} rel=({rx:.4f},{ry:.4f}) tpl={os.path.basename(path)}")

        advance(rect, "mouse_left", rx, ry, interval=0.25)
        return True

    log(f"  [TPL] not found after retries: {os.path.basename(path)}")
    return False


def do_advance_step(title_kw: str, method: str, rx: float, ry: float, interval: float):
    rect = find_window_rect(title_kw)
    advance(rect, method, _clamp01(rx), _clamp01(ry), interval=interval)

def detect_end_by_template(title_kw: str, end_tmpl_bgr, thr: float) -> bool:
    rect = find_window_rect(title_kw)
    frame = grab_window_bgr(rect)
    hit = match_template_center(frame, end_tmpl_bgr, threshold=thr)
    return hit is not None


# ============================================================
# Refactor helpers
# ============================================================

def _build_logger(log: Optional[Callable[[str], None]]) -> Callable[[str], None]:
    def _log(msg: str):
        if log:
            log(msg)
        else:
            print(msg)
    return _log

def _step_pause(_log: Callable[[str], None], step_delay: float, tag: str, sec: Optional[float] = None):
    s = step_delay if sec is None else float(sec)
    if s and s > 0:
        _log(f"  [UI] step delay {s:.2f}s ({tag})")
        time.sleep(s)

def _prepare_end_template(_log: Callable[[str], None], end_tmpl_path: str):
    end_tmpl_bgr = None
    if end_tmpl_path:
        resolved = resolve_template_path(end_tmpl_path)
        end_tmpl_bgr = template_exists_and_read(resolved) if resolved else None
        if end_tmpl_bgr is None:
            _log(f"  [D] end.template provided but cannot read: {end_tmpl_path} -> fallback to diff")
    else:
        _log("  [D] end.template not configured -> fallback to diff")
    return end_tmpl_bgr

def phase_A_enter(
    _log: Callable[[str], None],
    title_kw: str,
    entry_template: str,
    ref_before_enter,
    enter_thr: float,
    enter_retries: int,
    enter_retry_sleep: float,
    scene_change_diff_thr: float,
    scene_change_hits: int,
    scene_change_timeout: float,
    enter_double_click: bool,
):
    _log("  [A] capture reference & enter CG via entry.template ...")

    if not entry_template:
        raise RuntimeError("缺少 entry.template（请在 Step 1 Capture Entry）")

    ok = click_entry_with_verify(
        title_kw=title_kw,
        entry_tmpl_path=entry_template,
        ref_before_enter=ref_before_enter,
        log=_log,
        enter_thr=enter_thr,
        retries=enter_retries,
        retry_sleep=enter_retry_sleep,
        scene_change_diff_thr=scene_change_diff_thr,
        scene_change_hits=scene_change_hits,
        scene_change_timeout=scene_change_timeout,
        double_click=enter_double_click,
    )
    if not ok:
        raise RuntimeError(
            "点击入口后画面未变化（疑似没进CG）。建议："
            "1) 开启 enter_double_click "
            "2) 增大 enter_scene_change_timeout_sec "
            "3) 降低 enter_template_thr 或重截 entry 模板"
        )

def phase_B_preplay(
    _log: Callable[[str], None],
    stop_event: Event,
    title_kw: str,
    preplay_actions: list,
    act_thr: float,
    act_retries: int,
    act_retry_sleep: float,
):
    if not preplay_actions:
        _log("  [B] no pre-play actions (skip)")
        return

    _log("  [B] pre-play actions ...")
    for idx, a in enumerate(preplay_actions, 1):
        if stop_event.is_set():
            _log("  [STOP] stop requested during preplay.")
            break

        tpl = str(a.get("template", "")).strip()
        delay = float(a.get("delay", 0.5))
        _log(f"   - action {idx:02d}: tpl={os.path.basename(tpl)} delay={delay:.2f}s")

        appear_timeout = float(a.get("appear_timeout_sec", 0.0) or 0.0)
        if appear_timeout > 0:
            tries = max(act_retries, int(appear_timeout / max(0.05, act_retry_sleep)))
        else:
            tries = act_retries

        ok = click_template_in_window(
            title_kw=title_kw,
            tmpl_path=tpl,
            thr=act_thr,
            retries=tries,
            retry_sleep=act_retry_sleep,
            log=_log
        )
        if not ok:
            _log(f"     [WARN] action {idx:02d} template not found -> continue")

        time.sleep(max(0.0, delay))

def _check_end_conditions(
    title_kw: str,
    ref_before_enter,
    end_tmpl_bgr,
    end_thr: float,
    end_hits_need: int,
    return_diff_thr: float,
    return_hits_need: int,
    can_end: bool,
    hits_state: Dict[str, int],
    _log: Callable[[str], None],
) -> Tuple[bool, Dict[str, float]]:
    dbg = {"diff": 0.0, "end_hit": 0.0}

    if not can_end:
        hits_state["end_hits"] = 0
        hits_state["diff_hits"] = 0
        return False, dbg

    if end_tmpl_bgr is not None and detect_end_by_template(title_kw, end_tmpl_bgr, thr=end_thr):
        hits_state["end_hits"] += 1
        if hits_state["end_hits"] >= end_hits_need:
            _log(f"  [D] end.template detected -> stop (hits={hits_state['end_hits']})")
            return True, dbg
    else:
        hits_state["end_hits"] = 0

    rect = find_window_rect(title_kw)
    cur = grab_window_bgr(rect)
    diff = mean_abs_diff(ref_before_enter, cur)
    dbg["diff"] = diff

    if diff < return_diff_thr:
        hits_state["diff_hits"] += 1
        if hits_state["diff_hits"] >= return_hits_need:
            _log(f"  [D] return(diff) detected -> stop (diff={diff:.2f}, hits={hits_state['diff_hits']})")
            return True, dbg
    else:
        hits_state["diff_hits"] = 0

    return False, dbg


# ---------------- C stage dispatcher ----------------

def play_mode_default(
    _log: Callable[[str], None],
    stop_event: Event,
    title_kw: str,
    method: str,
    pacing: str,
    adv_rx: float,
    adv_ry: float,
    max_steps: int,
    click_interval: float,
    jitter_sec: float,
    min_play_sec: float,
    check_every_steps: int,
    ref_before_enter,
    end_tmpl_bgr,
    end_thr: float,
    end_hits_need: int,
    return_diff_thr: float,
    return_hits_need: int,
    act_thr: float,               # <--- NEW: 传入动作匹配阈值
    play_cfg_seq: Dict[str, Any] = None,
):
    # 1. --- 坐标覆盖逻辑 ---
    current_rx, current_ry = adv_rx, adv_ry

    # 2. --- 初始化分支队列 ---
    # 结构: [{ 'template': 'x.png', 'delay': 1.0, ... }]
    raw_branches = []
    if play_cfg_seq:
        raw_branches = play_cfg_seq.get("branches", []) or []
        target = play_cfg_seq.get("target")
        if target and isinstance(target, (list, tuple)) and len(target) >= 2:
            try:
                tx = float(target[0])
                ty = float(target[1])
                if 0.0 <= tx <= 1.0 and 0.0 <= ty <= 1.0:
                    current_rx = tx
                    current_ry = ty
                    _log(f"  [C] Overriding advance target: ({current_rx:.4f}, {current_ry:.4f})")
            except (ValueError, TypeError):
                pass

    # 预加载分支信息 (Template Path resolution)
    pending_branches = []
    for b in raw_branches:
        if not isinstance(b, dict): continue
        tname = str(b.get("template", "")).strip()
        if not tname: continue
        
        # 尝试解析路径，确保文件存在
        tpath = resolve_template_path(tname)
        if not tpath or not os.path.exists(tpath):
            _log(f"  [WARN] Branch template not found: {tname} (will skip)")
            continue
            
        # 预读取图片 (内存换速度)
        tbgr = cv2.imread(tpath, cv2.IMREAD_COLOR)
        if tbgr is None:
            _log(f"  [WARN] Branch template invalid: {tname}")
            continue

        pending_branches.append({
            "name": tname,
            "bgr": tbgr,
            "delay": float(b.get("delay", 1.0))
        })
    
    if pending_branches:
        _log(f"  [C] Branching enabled. {len(pending_branches)} branches pending.")

    _log("  [C] play loop ...")
    t0 = time.time()
    hits_state = {"diff_hits": 0, "end_hits": 0}

    for k in range(max_steps):
        if stop_event.is_set():
            _log(f"[STOP] stop requested during play (k={k}).")
            break

        elapsed = time.time() - t0
        can_end = (elapsed >= min_play_sec)

        # -------------------------------------------------
        # 1. 抓取当前帧 (Unified Grab)
        # -------------------------------------------------
        rect = find_window_rect(title_kw)
        frame = grab_window_bgr(rect)
        if frame is None:
            time.sleep(0.5)
            continue

        # -------------------------------------------------
        # 2. 结束条件检测 (End Check)
        # -------------------------------------------------
        do_check = (k % check_every_steps == 0) if check_every_steps > 0 else True
        if do_check:
            # 这里的 _check_end_conditions 我们稍微修改一下或者直接用
            # 为了不改动太多 helper，我们这里手动做一下检测，复用 grab 到的 frame
            # (注：原 helper 内部会自己 grab，这里为了性能理应重构，但为了稳健先调用现有的)
            # 鉴于 End detection 频率不高，让它自己 grab 一次也无妨。
            
            should_stop, dbg = _check_end_conditions(
                title_kw=title_kw,
                ref_before_enter=ref_before_enter,
                end_tmpl_bgr=end_tmpl_bgr,
                end_thr=end_thr,
                end_hits_need=end_hits_need,
                return_diff_thr=return_diff_thr,
                return_hits_need=return_hits_need,
                can_end=can_end,
                hits_state=hits_state,
                _log=_log,
            )
            if should_stop:
                break
        
        # -------------------------------------------------
        # 3. 分支检测 (Branching Check)
        # -------------------------------------------------
        matched_branch = None
        matched_idx = -1
        match_res = None # (cx, cy, score)

        if pending_branches:
            # --- 策略 A: 优先检测队首 (Head Check) ---
            head = pending_branches[0]
            res = match_template_center(frame, head["bgr"], threshold=act_thr)
            if res:
                matched_branch = head
                matched_idx = 0
                match_res = res
            
            # --- 策略 B: 队首没中，检测剩余 (Deep Scan) ---
            elif len(pending_branches) > 1:
                # 遍历剩下的
                for i, br in enumerate(pending_branches[1:], start=1):
                    res = match_template_center(frame, br["bgr"], threshold=act_thr)
                    if res:
                        matched_branch = br
                        matched_idx = i
                        match_res = res
                        break
        
        # -------------------------------------------------
        # 4. 执行决策
        # -------------------------------------------------
        if matched_branch and match_res:
            # === Case 1: 命中分支 ===
            cx, cy, score = match_res
            tname = matched_branch["name"]
            
            # 计算相对坐标 (Relative)
            rw = max(1, rect.width)
            rh = max(1, rect.height)
            click_rx = _clamp01(cx / rw)
            click_ry = _clamp01(cy / rh)

            _log(f"  [BRANCH] Matched #{matched_idx} '{tname}' (score={score:.2f}) -> Click ({click_rx:.3f}, {click_ry:.3f})")
            
            # 点击分支
            advance(rect, "mouse_left", click_rx, click_ry, interval=0.1)
            
            # 消费队列 (移除当前及之前的所有项)
            removed_count = matched_idx + 1
            del pending_branches[:removed_count]
            _log(f"           Queue updated: {removed_count} removed, {len(pending_branches)} remaining.")
            
            # 等待 (Branch Delay)
            dly = matched_branch["delay"]
            if dly > 0:
                time.sleep(dly)
                
            # 跳过常规推进，直接下一轮
            continue

        else:
            # === Case 2: 常规推进 ===
            interval = click_interval
            if jitter_sec > 0:
                interval = max(0.01, interval + (np.random.rand() * 2 - 1) * jitter_sec)

            if pacing == "audio":
                # TODO: Implement Audio Wait
                interval = click_interval 

            advance(rect, method, _clamp01(current_rx), _clamp01(current_ry), interval=interval)

def play_dispatch(
    _log: Callable[[str], None],
    stop_event: Event,
    title_kw: str,
    play_cfg_seq: Dict[str, Any],
    adv_rx: float,
    adv_ry: float,
    max_steps: int,  # 👈 ✅ 修复：确保这里接收 max_steps
    click_interval: float,
    jitter_sec: float,
    min_play_sec: float,
    check_every_steps: int,
    ref_before_enter,
    end_tmpl_bgr,
    end_thr: float,
    end_hits_need: int,
    return_diff_thr: float,
    return_hits_need: int,
    act_thr: float,
):
    method = str(play_cfg_seq.get("advance_method", "mouse_left")).strip()
    pacing = str(play_cfg_seq.get("pacing", "system")).strip()
    mode   = str(play_cfg_seq.get("mode", "default")).strip()

    if mode == "default":
        return play_mode_default(
            _log=_log,
            stop_event=stop_event,
            title_kw=title_kw,
            method=method,
            pacing=pacing,
            adv_rx=adv_rx,
            adv_ry=adv_ry,
            max_steps=max_steps,  # 👈 ✅ 传递 max_steps
            click_interval=click_interval,
            jitter_sec=jitter_sec,
            min_play_sec=min_play_sec,
            check_every_steps=check_every_steps,
            ref_before_enter=ref_before_enter,
            end_tmpl_bgr=end_tmpl_bgr,
            end_thr=end_thr,
            end_hits_need=end_hits_need,
            return_diff_thr=return_diff_thr,
            return_hits_need=return_hits_need,
            act_thr=act_thr,
            play_cfg_seq=play_cfg_seq,
        )

    _log(f"  [C] unknown play.mode={mode}, fallback to default")
    return play_mode_default(
        _log=_log,
        stop_event=stop_event,
        title_kw=title_kw,
        method=method,
        pacing=pacing,
        adv_rx=adv_rx,
        adv_ry=adv_ry,
        max_steps=max_steps,  # 👈 ✅ 传递 max_steps
        click_interval=click_interval,
        jitter_sec=jitter_sec,
        min_play_sec=min_play_sec,
        check_every_steps=check_every_steps,
        ref_before_enter=ref_before_enter,
        end_tmpl_bgr=end_tmpl_bgr,
        end_thr=end_thr,
        end_hits_need=end_hits_need,
        return_diff_thr=return_diff_thr,
        return_hits_need=return_hits_need,
        act_thr=act_thr,
        play_cfg_seq=play_cfg_seq,
    )


# ---------- runner ----------

def run_all_sequences(
    stop_event: Optional[Event] = None,
    log: Optional[Callable[[str], None]] = None
):
    gr = os.environ.get("GALREC_GAME_ROOT", "").strip()
    if gr:
        set_game_root(gr)
    
    _log = _build_logger(log)
    stop_event = stop_event or Event()

    # ✅ 启动 F9 监听线程
    hotkey_thread = Thread(target=_watch_global_hotkey, args=(stop_event, _log), daemon=True)
    hotkey_thread.start()

    cfg = load_config()
    prog = load_progress()
    tasks_state = prog.setdefault("tasks", {})

    run_only = prog.get("run_only", None)
    if isinstance(run_only, list):
        run_only = set(str(x).zfill(3) for x in run_only)
    else:
        run_only = None

    def get_state(sid: int):
        return tasks_state.get(f"{sid:03d}", {})

    def set_state(sid: int, **kwargs):
        k = f"{sid:03d}"
        st = tasks_state.get(k, {})
        st.update(kwargs)
        st["ts"] = time.time()
        tasks_state[k] = st
        prog["tasks"] = tasks_state
        save_progress(prog)

    title_kw = cfg.get("game_window_title", "").strip()
    if not title_kw:
        raise RuntimeError("config.yaml 缺少 game_window_title")
    if title_kw:
        try:
            _log(f"[UI] Activating game window: {title_kw}")
            activate_window(title_kw)
            time.sleep(0.5)
        except Exception as e:
            _log(f"[WARN] Failed to activate game window: {e}")
    else:
        raise RuntimeError("config.yaml 缺少 game_window_title")

    obs_cfg    = cfg.get("obs", {}) or {}
    ui_cfg     = cfg.get("ui", {}) or {}
    vision_cfg = cfg.get("vision", {}) or {}
    end_cfg    = cfg.get("end_detection", {}) or {}
    play_cfg   = cfg.get("play", {}) or {}
    audio_cfg  = cfg.get("audio", {}) or {}

    STEP_DELAY = float(ui_cfg.get("step_delay_sec", 0.0))
    ENTER_AFTER_WAIT = float(ui_cfg.get("step_delay_entry_after_click", 0.0))
    AFTER_PREPLAY_WAIT = float(ui_cfg.get("step_delay_after_preplay", 0.0))

    adv_rx = float(ui_cfg.get("advance_click_rel_x", 0.50))
    adv_ry = float(ui_cfg.get("advance_click_rel_y", 0.90))

    ENTER_THR = float(vision_cfg.get("enter_template_thr", 0.80))
    ACT_THR   = float(vision_cfg.get("action_template_thr", 0.80))

    ENTER_RETRIES     = int(vision_cfg.get("enter_retries", 10))
    ACT_RETRIES       = int(vision_cfg.get("action_retries", 10))
    RETRY_SLEEP_SEC   = float(vision_cfg.get("retry_sleep_sec", 0.25))
    ENTER_RETRY_SLEEP = RETRY_SLEEP_SEC
    ACT_RETRY_SLEEP   = RETRY_SLEEP_SEC

    SCENE_CHANGE_DIFF_THR   = float(ui_cfg.get("enter_scene_change_diff_thr", 10.0))
    SCENE_CHANGE_HITS       = int(ui_cfg.get("enter_scene_change_hits", 3))
    SCENE_CHANGE_TIMEOUT    = float(ui_cfg.get("enter_scene_change_timeout_sec", 2.0))
    ENTER_DOUBLE_CLICK      = bool(ui_cfg.get("enter_double_click", True))

    END_THR       = float(end_cfg.get("end_template_thr", 0.86))
    END_HITS_NEED = int(end_cfg.get("end_hits_need", 3))

    RETURN_DIFF_THR  = float(end_cfg.get("return_diff_thr", 6.0))
    RETURN_HITS_NEED = int(end_cfg.get("return_hits_need", 6))
    MIN_PLAY_SEC     = float(end_cfg.get("min_play_sec", 2.0))

    CHECK_EVERY_STEPS = int(end_cfg.get("check_every_steps", 1))
    if CHECK_EVERY_STEPS < 1:
        CHECK_EVERY_STEPS = 1

    MAX_STEPS = int(play_cfg.get("max_steps", 2000))
    CLICK_INTERVAL = float(play_cfg.get("pacing_system_sec", ui_cfg.get("click_interval_sec", 0.35)))

    JITTER_SEC = float(play_cfg.get("jitter_sec", 0.0))
    if JITTER_SEC < 0:
        JITTER_SEC = 0.0

    COUNTDOWN_SEC = int(ui_cfg.get("countdown_sec", 3))
    AUDIO_ENABLED = bool(audio_cfg.get("enabled", False))

    if bool(ui_cfg.get("disable_failsafe", False)):
        pyautogui.FAILSAFE = False

    try:
        rec = OBSRecorder(
            host=obs_cfg.get("host", "127.0.0.1"),
            port=int(obs_cfg.get("port", 4455)),
            password=os.environ.get("OBS_PASSWORD", obs_cfg.get("password", "")),
            output_raw_dir=obs_cfg.get("output_raw_dir", ""),
            output_final_dir=obs_cfg.get("output_final_dir", ""),
        )
        _log("[OK] OBS Connected.")
    except Exception as e:
        _log(f"\n[FATAL] 无法连接到 OBS! (Error: {e})")
        _log("请检查：OBS 是否打开？OBS WebSocket 是否开启？端口密码是否匹配？")
        try:
            activate_window("ui_electron")
        except:
            pass
        return

    sequences = list_sequences()
    if not sequences:
        raise RuntimeError("sequences 目录为空。请先用 sequence_editor 保存至少一个任务。")


    already_done = sum(1 for v in tasks_state.values() if v.get("status") == "done")
    _log(f"[INFO] total sequences: {len(sequences)} | already done: {already_done}")

    try:
        for raw_seq in sequences:
            if stop_event.is_set():
                _log("[STOP] stop requested before starting next sequence.")
                break

            seq = normalize_seq(raw_seq)
            sid = int(seq.get("id", 0))
            sid_str = f"{sid:03d}"

            if run_only is not None and sid_str not in run_only:
                continue

            st = get_state(sid)
            if st.get("status") == "done":
                _log(f"[SKIP] {sid:03d} already done")
                continue

            name = (seq.get("name") or f"CG_{sid:03d}").strip()

            rec_cfg = seq.get("record") or {}
            basename = (rec_cfg.get("basename") or "").strip() or name
            basename = safe_filename(basename) or name

            entry = seq.get("entry") or {}
            preplay = (seq.get("preplay") or {}).get("actions", [])
            play_seq = seq.get("play") or {}
            end_seq = seq.get("end") or {}
            end_tmpl_path = str(end_seq.get("template", "")).strip()

            _log(f"\n[RUN] {sid:03d} {name} -> {basename}")
            set_state(sid, status="running", name=name, basename=basename)

            try:
                _log(f"  entry.mode={entry.get('mode','gallery')} | preplay.actions={len(preplay)} | play={play_seq.get('advance_method')}/{play_seq.get('pacing')} mode={play_seq.get('mode','default')}")

                rect = find_window_rect(title_kw)
                ref_before_enter = grab_window_bgr(rect)

                # ============ A: Enter CG ============
                tpl_path = str(entry.get("template", "")).strip()
                phase_A_enter(
                    _log=_log,
                    title_kw=title_kw,
                    entry_template=tpl_path,
                    ref_before_enter=ref_before_enter,
                    enter_thr=ENTER_THR,
                    enter_retries=ENTER_RETRIES,
                    enter_retry_sleep=ENTER_RETRY_SLEEP,
                    scene_change_diff_thr=SCENE_CHANGE_DIFF_THR,
                    scene_change_hits=SCENE_CHANGE_HITS,
                    scene_change_timeout=SCENE_CHANGE_TIMEOUT,
                    enter_double_click=ENTER_DOUBLE_CLICK,
                )
                time.sleep(ENTER_AFTER_WAIT)

                # ============ B: Pre-play ============
                phase_B_preplay(
                    _log=_log,
                    stop_event=stop_event,
                    title_kw=title_kw,
                    preplay_actions=preplay,
                    act_thr=ACT_THR,
                    act_retries=ACT_RETRIES,
                    act_retry_sleep=ACT_RETRY_SLEEP,
                )

                if stop_event.is_set():
                    _log("  [STOP] stop requested before recording start -> abort this seq (not marking done).")
                    break

                # ============ REC: Start recording ============
                _log("  [REC] start OBS recording ...")
                _step_pause(_log, STEP_DELAY, "after preplay", AFTER_PREPLAY_WAIT)
                rec.start()
                _step_pause(_log, STEP_DELAY, "after rec.start", None)

                # ============ Prepare end-template ============
                end_tmpl_bgr = _prepare_end_template(_log, end_tmpl_path)

                # ============ C + D ============
                try:
                    play_dispatch(
                        _log=_log,
                        stop_event=stop_event,
                        title_kw=title_kw,
                        play_cfg_seq=play_seq,
                        adv_rx=adv_rx,
                        adv_ry=adv_ry,
                        max_steps=MAX_STEPS,  # ✅ 传递 max_steps
                        click_interval=CLICK_INTERVAL,
                        jitter_sec=JITTER_SEC,
                        min_play_sec=MIN_PLAY_SEC,
                        check_every_steps=CHECK_EVERY_STEPS,
                        ref_before_enter=ref_before_enter,
                        end_tmpl_bgr=end_tmpl_bgr,
                        end_thr=END_THR,
                        end_hits_need=END_HITS_NEED,
                        return_diff_thr=RETURN_DIFF_THR,
                        return_hits_need=RETURN_HITS_NEED,
                        act_thr=ACT_THR,
                    )
                finally:
                    _log("  [REC] stop OBS recording ...")
                    rec.stop()
                    if not rec.wait_stopped(timeout=25.0):
                        _log("  [WARN] stop timeout, still try rename...")

                out = rec.rename_latest(basename)
                _log("[OK] saved: " + out)
                set_state(sid, status="done", name=name, basename=basename, out=out)

                if stop_event.is_set():
                    _log("[STOP] stop requested, exit after saving current output.")
                    break

            except Exception as e:
                _log(f"[FAIL] {sid:03d} {name}: {e}")
                set_state(sid, status="failed", name=name, basename=basename, error=str(e))
                
                # ✅✅✅ 致命错误熔断：文件存在错误直接退出，不重试
                if "目标文件已存在" in str(e) or isinstance(e, FileExistsError):
                    _log("\n[FATAL] Output file collision detected! Stopping runner completely to avoid infinite retries.")
                    stop_event.set()
                    break  # Break main loop
                
                if bool(ui_cfg.get("stop_on_fail", False)):
                    raise
                else:
                    continue
    finally:
        _log("\n[UI] Restoring GalRec Manager window...")
        try:
            ui_title = "ui_electron" 
            activate_window(ui_title)
        except Exception as e:
            print(f"Warning: Could not restore UI window: {e}")

        if prog.get("run_only"):
            prog.pop("run_only", None)
            save_progress(prog)

        _log("\n[END] runner finished.")

if __name__ == "__main__":
    run_all_sequences()