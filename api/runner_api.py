# api/runner_api.py
import os
import sys
import subprocess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from game_registry import GameRegistry

router = APIRouter(prefix="/runner", tags=["runner"])
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class StartRunnerReq(BaseModel):
    show_console: bool = True
    # ✅ 修改：默认为 False，这样跑完会自动关闭窗口
    keep_console: bool = False  
    log_to_file: bool = True

@router.post("/start")
def start_runner(req: StartRunnerReq):
    py = sys.executable
    runner_path = os.path.join(BASE_DIR, "runner.py")
    if not os.path.isfile(runner_path):
        raise HTTPException(status_code=404, detail=f"runner.py not found: {runner_path}")

    try:
        active_root = GameRegistry(BASE_DIR).resolve_active_root()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"no active game: {e}")

    env = os.environ.copy()
    env["GALREC_GAME_ROOT"] = active_root

    stdout = None
    stderr = None
    log_path = None
    if req.log_to_file:
        log_dir = os.path.join(BASE_DIR, ".galrec")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.abspath(os.path.join(log_dir, "runner.log"))
        f = open(log_path, "a", encoding="utf-8")
        stdout = f
        stderr = subprocess.STDOUT

    try:
        kwargs = {"cwd": BASE_DIR, "env": env, "stdout": stdout, "stderr": stderr}

        if sys.platform.startswith("win"):
            if req.show_console:
                kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
                # 根据 req.keep_console 决定是用 /K (保留) 还是 /C (关闭)
                flag = "/K" if req.keep_console else "/C"

                # 构造命令字符串
                command = f'chcp 65001>nul & "{py}" "{runner_path}"'
                full_cmd = f'cmd.exe {flag} "{command}"'
                
                p = subprocess.Popen(full_cmd, **kwargs)
            else:
                kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
                p = subprocess.Popen([py, runner_path], **kwargs)
        else:
            p = subprocess.Popen([py, runner_path], **kwargs)

        return {
            "ok": True,
            "pid": p.pid,
            "runner": runner_path,
            "game_root": active_root,
            "log": log_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to start runner: {e}")