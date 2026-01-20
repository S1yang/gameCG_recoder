# api/server.py
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import uvicorn

from tasks import router as tasks_router
from games import router as games_router
from templates import router as templates_router
from config import router as config_router
from batch import router as batch_router
from backup import router as backup_router
from meta import router as meta_router
from progress import router as progress_router
from runner_api import router as runner_router
from capture import router as capture_router
from logs import router as logs_router

# Ensure we can import modules from project root (game_registry.py, state.py, etc.)
PROJECT_BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_BASE not in sys.path:
    sys.path.insert(0, PROJECT_BASE)

from api.runtime import find_free_port, write_runtime, install_atexit_cleanup, remove_runtime  # noqa: E402


def create_app() -> FastAPI:
    app = FastAPI(title="GalRec Local API", version="0.1")

    # Routers
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

    # Dev-friendly CORS (Electron/localhost). Tighten later if needed.
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

    install_atexit_cleanup(PROJECT_BASE)
    remove_runtime(PROJECT_BASE)
    write_runtime(api_base=api_base, pid=os.getpid(), base_dir=PROJECT_BASE)

    app = create_app()
    print(f"[GalRec API] {api_base}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
