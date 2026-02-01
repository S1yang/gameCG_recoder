import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";
import Store from "electron-store";

const store = new Store();

let win: BrowserWindow | null = null;
let pyProc: ChildProcessWithoutNullStreams | null = null;
let roiWin: BrowserWindow | null = null;

// ESM 下没有 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dev 下用项目根
const PROJECT_BASE = path.resolve(__dirname, "..", "..");

// ===================== ✅ 关键：构建版后端目录定位 =====================
function getBackendExePath(): string {
  return path.join(
    process.resourcesPath,
    "backend",
    "galrec_api",
    "galrec_api.exe"
  );
}

/**
 * 你喜欢的落盘位置是：
 * resources/backend/galrec_api/_internal/.galrec/...
 * 所以这里把 build 的 base_dir 固定到 _internal。
 *
 * 注意：这个 _internal 是 PyInstaller onedir 默认会有的目录（装 python 依赖/动态库）。
 * 如果你未来改了 spec 或目录名，只要改这里一个地方即可。
 */
function getBackendBaseDir(): string {
  // build 才有 resourcesPath
  const backendRoot = path.join(process.resourcesPath, "backend", "galrec_api");

  // ✅ 优先用 _internal（与你现在的 runner.log 路径一致）
  const internalDir = path.join(backendRoot, "_internal");
  if (fs.existsSync(internalDir)) return internalDir;

  // 兜底：没有 _internal 就用 backendRoot
  return backendRoot;
}

function getRuntimePath(): string {
  // ✅ dev：保持原行为
  if (!app.isPackaged) {
    return path.join(PROJECT_BASE, ".galrec", "runtime.json");
  }

  // ✅ build：从后端自己的 base_dir 里读
  return path.join(getBackendBaseDir(), ".galrec", "runtime.json");
}

// 🟢 单实例锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// --- ROI Overlay Logic ---
function openRoiOverlay() {
  if (roiWin) {
    roiWin.focus();
    return;
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  roiWin = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    fullscreen: true,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "roi", "preload_roi.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  roiWin.setAlwaysOnTop(true, "screen-saver");
  roiWin.loadFile(path.join(__dirname, "roi", "roi_overlay.html"));

  roiWin.on("closed", () => {
    roiWin = null;
  });
}

// --- Python Process Logic ---
function findPythonExe(): string {
  const fromEnv = process.env.GALREC_PYTHON;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const venvPy = path.join(PROJECT_BASE, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(venvPy)) return venvPy;

  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const condaPy = path.join(condaPrefix, "python.exe");
    if (fs.existsSync(condaPy)) return condaPy;
  }

  return process.platform === "win32" ? "python" : "python3";
}

function getBackendCommand(): { cmd: string; args: string[]; cwd: string } {
  const isDev = !app.isPackaged;

  if (isDev) {
    const pythonExe = findPythonExe();
    const serverPath = path.join(PROJECT_BASE, "api", "server.py");
    return { cmd: pythonExe, args: [serverPath], cwd: PROJECT_BASE };
  }

  const exe = getBackendExePath();
  // ✅ 关键：让后端 cwd 就是 _internal（你喜欢的写入位置）
  const cwd = getBackendBaseDir();
  return { cmd: exe, args: [], cwd };
}

function startPythonApi() {
  if (pyProc) return;

  const { cmd, args, cwd } = getBackendCommand();

  const rtPath = getRuntimePath();
  fs.mkdirSync(path.dirname(rtPath), { recursive: true });

  console.log("[Electron] Starting Backend:", cmd);
  console.log("[Electron] backend cwd:", cwd);
  console.log("[Electron] runtime.json:", rtPath);

  pyProc = spawn(cmd, args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,

      // ✅ 不搬家：只告诉后端“你的 base_dir 是哪里”
      // dev 下就是 PROJECT_BASE；build 下就是 _internal
      GALREC_BASE_DIR: cwd,

      // ✅ runtime.json 也落在 base_dir/.galrec 下（你喜欢的结构）
      // 这里传不传都行；传了可以让后端更确定
      GALREC_RUNTIME_PATH: rtPath,

      PYTHONUNBUFFERED: "1",
    },
  });

  pyProc.stdout.on("data", (d) => console.log("[PY]", d.toString().trim()));
  pyProc.stderr.on("data", (d) => console.log("[PY-ERR]", d.toString().trim()));
  pyProc.on("exit", (code) => console.log("[PY] exited code:", code));
}

function stopPythonApi() {
  if (!pyProc) return;

  const pid = pyProc.pid;
  console.log("[Electron] Killing backend process...", pid);

  if (process.platform === "win32" && pid) {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
  } else {
    pyProc.kill("SIGTERM");
  }
  pyProc = null;
}

// --- Helper ---
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitForApiReady(
  timeoutMs = 15000
): Promise<{ api_base: string }> {
  const start = Date.now();
  const RUNTIME_PATH = getRuntimePath();

  while (Date.now() - start < timeoutMs) {
    try {
      if (fs.existsSync(RUNTIME_PATH)) {
        const raw = fs.readFileSync(RUNTIME_PATH, "utf-8");
        const obj = JSON.parse(raw);
        if (obj.api_base) {
          try {
            const r = await fetch(`${obj.api_base}/health`);
            const j = await r.json();
            if (j && j.ok) return obj;
          } catch {}
        }
      }
    } catch {}
    await sleep(150);
  }
  throw new Error("API not ready");
}

// --- Main Window ---
async function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  if (!fs.existsSync(preloadPath)) throw new Error("preload.js missing");

  const bounds: any = store.get("windowBounds", {
    width: 1440,
    height: 900,
  });

  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const saveState = () => {
    if (!win) return;
    store.set("windowBounds", win.getBounds());
  };
  win.on("resize", saveState);
  win.on("move", saveState);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// --- App Lifecycle ---
app.on("window-all-closed", () => {
  stopPythonApi();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopPythonApi();
});

app.whenReady().then(async () => {
  startPythonApi();

  ipcMain.handle("galrec:getApiBase", async () => {
    try {
      const rt = await waitForApiReady(15000);
      return rt.api_base;
    } catch (e) {
      console.error(e);
      return "";
    }
  });

  ipcMain.handle("galrec:openRoiOverlay", () => {
    openRoiOverlay();
    return true;
  });

  ipcMain.handle("galrec:closeRoiOverlay", () => {
    if (roiWin) {
      roiWin.close();
      roiWin = null;
    }
    return true;
  });

  await createWindow();
});
