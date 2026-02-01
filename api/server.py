# api/server.py
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ✅ 先把“项目根(DEV)”加进 sys.path，保证 dev 下 from api.xxx 不炸
DEV_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if DEV_PROJECT_ROOT not in sys.path:
    sys.path.insert(0, DEV_PROJECT_ROOT)

from api.runtime import (
    get_base_dir,
    find_free_port,
    write_runtime,
    install_atexit_cleanup,
    remove_runtime,
)

from api.tasks import router as tasks_router
from api.games import router as games_router
from api.templates import router as templates_router
from api.config import router as config_router
from api.batch import router as batch_router
from api.backup import router as backup_router
from api.meta import router as meta_router
from api.progress import router as progress_router
from api.runner_api import router as runner_router
from api.capture import router as capture_router
from api.logs import router as logs_router


def create_app() -> FastAPI:
    app = FastAPI(title="GalRec Local API", version="0.1")

    app.include_router(config_router)
    app.include_router(games_router)
    app.include_router(tasks_router)
    app.include_router(templates_router)
    app.include_router(batch_router)
    app.include_router(backup_router)
    app.include_router(meta_router)
    app.include_router(progress_router)
    app.include_router(runner_router)
    app.include_router(capture_router)
    app.include_router(logs_router)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"ok": True}

    return app


def main():
    host = "127.0.0.1"
    port = find_free_port(host)
    api_base = f"http://{host}:{port}"

    # ✅ 唯一权威：BASE_DIR（dev=项目根，packaged=_internal）
    base_dir = get_base_dir()
    os.makedirs(base_dir, exist_ok=True)

    install_atexit_cleanup(base_dir)
    remove_runtime(base_dir)
    write_runtime(api_base=api_base, pid=os.getpid(), base_dir=base_dir)

    app = create_app()
    print(f"[GalRec API] {api_base}  base_dir={base_dir}")

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        log_config=None,  # ✅ 避免 isatty None 的 uvicorn 日志坑
    )


if __name__ == "__main__":
    main()
