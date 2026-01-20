# api/logs.py
import os
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/logs", tags=["logs"])

# 指向项目根目录下的 .galrec/runner.log
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOG_FILE = os.path.join(BASE_DIR, ".galrec", "runner.log")

@router.get("", response_class=PlainTextResponse)
def get_logs(n: int = 1000):
    """获取最后 n 行日志 (倒读)"""
    if not os.path.exists(LOG_FILE):
        return f"[Info] Log file not found yet at: {LOG_FILE}"
    
    try:
        # 🟢 修改：使用 gb18030 编码读取，兼容中文 GBK 环境
        # errors='replace' 会将无法识别的字节显示为 ，防止 API 报错崩溃
        with open(LOG_FILE, "r", encoding="gb18030", errors="replace") as f:
            lines = f.readlines()
            # 返回最后 n 行
            return "".join(lines[-n:])
    except Exception as e:
        return f"[Error] Reading log failed: {e}"

@router.delete("")
def clear_logs():
    """清空日志文件内容"""
    if not os.path.exists(LOG_FILE):
        return {"ok": True, "msg": "File did not exist"}

    try:
        # 写入时通常无所谓，空文件没有编码问题
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write("")
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}