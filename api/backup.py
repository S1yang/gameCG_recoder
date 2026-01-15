# api/backup.py
import os
import io
import zipfile
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

from game_registry import GameRegistry
from state import set_game_root

router = APIRouter(prefix="/backup", tags=["backup"])




def _root_for_key(key: Optional[str]) -> str:
    reg = GameRegistry(BASE_DIR)
    if key:
        root = reg.resolve_root(key)
    else:
        root = reg.resolve_active_root()
    set_game_root(root)
    return root


def _zip_game_root(root: str) -> io.BytesIO:
    """
    打包：config.yaml、queue.yaml、sequences/*.yaml、templates/*(图片)
    """
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for rel in ["config.yaml", "queue.yaml"]:
            fp = os.path.join(root, rel)
            if os.path.isfile(fp):
                z.write(fp, arcname=rel)

        seq_dir = os.path.join(root, "sequences")
        if os.path.isdir(seq_dir):
            for fn in os.listdir(seq_dir):
                if fn.lower().endswith((".yaml", ".yml")):
                    z.write(os.path.join(seq_dir, fn), arcname=f"sequences/{fn}")

        tpl_dir = os.path.join(root, "templates")
        if os.path.isdir(tpl_dir):
            for fn in os.listdir(tpl_dir):
                # 不强制后缀，允许你未来存别的辅助文件
                z.write(os.path.join(tpl_dir, fn), arcname=f"templates/{fn}")

    mem.seek(0)
    return mem


class ImportReq(BaseModel):
    key: Optional[str] = None  # 不填则导入到 active game
    overwrite: bool = False    # 是否覆盖已有文件


@router.get("/export")
def export_game(key: Optional[str] = None):
    root = _root_for_key(key)
    buf = _zip_game_root(root)

    # 生成一个合理文件名
    name = os.path.basename(root.rstrip("\\/")) or "game"
    filename = f"{name}.galrec.zip"

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_game(meta: ImportReq, file: UploadFile = File(...)):
    """
    上传 zip，并解压到目标 game_root。
    - overwrite=False 时，如果目标文件已存在则报错（更安全）
    """
    root = _root_for_key(meta.key)

    data = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except Exception as e:
        raise HTTPException(400, f"invalid zip: {e}")

    # 允许的前缀
    allowed_prefix = ("config.yaml", "queue.yaml", "sequences/", "templates/")

    # 解压
    for info in zf.infolist():
        name = info.filename.replace("\\", "/")

        if not name or name.endswith("/"):
            continue
        if not name.startswith(allowed_prefix):
            continue

        # 防止路径穿越
        if ".." in name.split("/"):
            raise HTTPException(400, f"illegal path in zip: {name}")

        dst = os.path.abspath(os.path.join(root, name))
        if not dst.startswith(os.path.abspath(root)):
            raise HTTPException(400, f"path traversal blocked: {name}")

        os.makedirs(os.path.dirname(dst), exist_ok=True)

        if os.path.exists(dst) and not meta.overwrite:
            raise HTTPException(409, f"file exists: {name} (set overwrite=true)")

        with open(dst, "wb") as f:
            f.write(zf.read(info))

    return {"ok": True, "root": root}
