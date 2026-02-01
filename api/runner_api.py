# api/runner_api.py
import os
import sys
import subprocess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.runtime import get_base_dir
from game_registry import GameRegistry

router = APIRouter(prefix="/runner", tags=["runner"])


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _runner_py_path_dev() -> str:
    # dev: runner.py 在项目根（BASE_DIR）下
    return os.path.join(get_base_dir(), "runner.py")


def _runner_exe_path_packaged() -> str:
    # packaged: runner exe 放在 BASE_DIR(_internal) 下
    return os.path.join(get_base_dir(), "galrec_runner.exe")


class StartRunnerReq(BaseModel):
    show_console: bool = True
    keep_console: bool = False
    log_to_file: bool = True


@router.post("/start")
def start_runner(req: StartRunnerReq):
    base_dir = get_base_dir()     # dev=项目根, packaged=_internal
    os.makedirs(base_dir, exist_ok=True)

    # ✅ registry 必须读写同一个 base_dir（否则就会出现你说的“外面又新建一套”）
    try:
        active_root = GameRegistry(base_dir).resolve_active_root()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"no active game: {e}")

    env = os.environ.copy()
    env["GALREC_GAME_ROOT"] = active_root
    env["GALREC_BASE_DIR"] = base_dir   # ✅ 让 runner 内部也用同一个根目录

    stdout = None
    stderr = None
    log_path = None
    f = None

    if req.log_to_file:
        log_dir = os.path.join(base_dir, ".galrec")
        os.makedirs(log_dir, exist_ok=True)
        log_path = os.path.abspath(os.path.join(log_dir, "runner.log"))
        f = open(log_path, "a", encoding="utf-8")
        stdout = f
        stderr = subprocess.STDOUT

    try:
        kwargs = {"cwd": base_dir, "env": env, "stdout": stdout, "stderr": stderr}

        if sys.platform.startswith("win"):
            if not _is_frozen():
                # dev: python runner.py
                py = sys.executable
                runner_path = _runner_py_path_dev()
                if not os.path.isfile(runner_path):
                    raise HTTPException(status_code=404, detail=f"runner.py not found: {runner_path}")

                if req.show_console:
                    kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
                    flag = "/K" if req.keep_console else "/C"
                    command = f'chcp 65001>nul & "{py}" "{runner_path}"'
                    full_cmd = f'cmd.exe {flag} "{command}"'
                    p = subprocess.Popen(full_cmd, **kwargs)
                else:
                    kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
                    p = subprocess.Popen([py, runner_path], **kwargs)

                return {
                    "ok": True,
                    "mode": "dev",
                    "pid": p.pid,
                    "runner": runner_path,
                    "game_root": active_root,
                    "cwd": base_dir,
                    "log": log_path,
                }

            # packaged: run galrec_runner.exe (located in BASE_DIR=_internal)
            runner_exe = _runner_exe_path_packaged()
            if not os.path.isfile(runner_exe):
                raise HTTPException(status_code=404, detail=f"galrec_runner.exe not found: {runner_exe}")

            if req.show_console:
                kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
                p = subprocess.Popen([runner_exe], **kwargs)
            else:
                kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
                p = subprocess.Popen([runner_exe], **kwargs)

            return {
                "ok": True,
                "mode": "packaged",
                "pid": p.pid,
                "runner": runner_exe,
                "game_root": active_root,
                "cwd": base_dir,
                "log": log_path,
            }

        # non-win (保持简单)
        if not _is_frozen():
            py = sys.executable
            runner_path = _runner_py_path_dev()
            if not os.path.isfile(runner_path):
                raise HTTPException(status_code=404, detail=f"runner.py not found: {runner_path}")
            p = subprocess.Popen([py, runner_path], **kwargs)
        else:
            runner_exe = _runner_exe_path_packaged()
            if not os.path.isfile(runner_exe):
                raise HTTPException(status_code=404, detail=f"galrec_runner not found: {runner_exe}")
            p = subprocess.Popen([runner_exe], **kwargs)

        return {"ok": True, "pid": p.pid, "game_root": active_root, "cwd": base_dir, "log": log_path}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to start runner: {e}")
    finally:
        # 不 close f，runner 持续写日志
        pass
