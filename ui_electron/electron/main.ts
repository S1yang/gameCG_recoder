import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";

let win: BrowserWindow | null = null;
let pyProc: ChildProcessWithoutNullStreams | null = null;

// ESM 下没有 __dirname，这样取
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 这里的 __dirname = ui_electron/dist-electron (编译后)
// PROJECT_BASE = 回到项目根目录 gameCG_recoder
const PROJECT_BASE = path.resolve(__dirname, "..", "..");
const RUNTIME_PATH = path.join(PROJECT_BASE, ".galrec", "runtime.json");

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitForApiReady(
  timeoutMs = 15000
): Promise<{ api_base: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.existsSync(RUNTIME_PATH)) {
        const raw = fs.readFileSync(RUNTIME_PATH, "utf-8");
        const obj = JSON.parse(raw);
        if (obj.api_base) {
          // ✅ 关键：探测 /health 是否真的通
          try {
            const r = await fetch(`${obj.api_base}/health`);
            const j = await r.json();
            if (j && j.ok) return obj;
          } catch {
            // health 还没 ready，继续等
          }
        }
      }
    } catch {}
    await sleep(150);
  }
  throw new Error("API not ready (runtime.json or /health timeout)");
}

function findPythonExe(): string {
  // 1) 允许你临时用环境变量指定（可选）
  const fromEnv = process.env.GALREC_PYTHON;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // 2) 优先使用项目内 .venv（如果你是 venv 路线）
  const venvPy = path.join(PROJECT_BASE, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPy)) return venvPy;

  // 3) 如果你是 conda，通常会有 CONDA_PREFIX
  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const condaPy = path.join(condaPrefix, "python.exe");
    if (fs.existsSync(condaPy)) return condaPy;
  }

  // 4) 兜底：系统 python
  return process.platform === "win32" ? "python" : "python3";
}

function startPythonApi() {
  const pythonExe = findPythonExe();
  const serverPath = path.join(PROJECT_BASE, "api", "server.py");

  console.log("[Electron] PROJECT_BASE =", PROJECT_BASE);
  console.log("[Electron] RUNTIME_PATH =", RUNTIME_PATH);
  console.log("[Electron] Using python =", pythonExe);

  pyProc = spawn(pythonExe, [serverPath], {
    cwd: PROJECT_BASE,
    stdio: "pipe",
  });

  pyProc.stdout.on("data", (d) => console.log("[PY]", d.toString().trim()));
  pyProc.stderr.on("data", (d) => console.log("[PY-ERR]", d.toString().trim()));
  pyProc.on("exit", (code) => console.log("[PY] exited", code));
}

function stopPythonApi() {
  if (pyProc && !pyProc.killed) pyProc.kill();
  pyProc = null;
}

async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  console.log("[Electron] preloadPath =", preloadPath);
  if (!fs.existsSync(preloadPath)) {
    // 直接终止，避免默默失败
    throw new Error("preload.js not found: " + preloadPath);
  }

  win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ✅ 有些环境 sandbox 会阻止 preload，先关掉确保能跑
    },
  });

  // ✅ 页面加载完，验证 window.galrec 是否存在（直接在渲染进程里执行一段 JS）
  win.webContents.on("did-finish-load", async () => {
    try {
      const has = await win!.webContents.executeJavaScript(
        "typeof window.galrec !== 'undefined'",
        true
      );
      console.log("[Electron] window.galrec injected?", has);
    } catch (e) {
      console.log("[Electron] executeJavaScript check failed:", e);
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadURL("about:blank");
  }
}

app.on("window-all-closed", () => {
  stopPythonApi();
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(async () => {
  startPythonApi();

  try {
    const rt = await waitForApiReady(15000);
    ipcMain.handle("galrec:getApiBase", async () => rt.api_base);
  } catch (e: any) {
    ipcMain.handle("galrec:getApiBase", async () => "");
    console.error("[Electron] Failed to read runtime.json:", e?.message || e);
  }

  await createWindow();
});
