import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { fileURLToPath } from "url";
import Store from "electron-store"; // 🟢 1. 引入 Store

// 初始化 Store
const store = new Store();

let win: BrowserWindow | null = null;
let pyProc: ChildProcessWithoutNullStreams | null = null;
let roiWin: BrowserWindow | null = null;

// ESM 下没有 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_BASE = path.resolve(__dirname, "..", "..");
const RUNTIME_PATH = path.join(PROJECT_BASE, ".galrec", "runtime.json");

// 🟢 4. 单实例锁：防止打开两个程序冲突
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

  // 获取鼠标所在屏幕的尺寸
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);

  roiWin = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    fullscreen: true, // 全屏覆盖
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      // 指向你的 roi preload
      preload: path.join(__dirname, "roi", "preload_roi.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  roiWin.setAlwaysOnTop(true, "screen-saver");
  // 指向你的 roi html
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

function startPythonApi() {
  if (pyProc) return; // 防止重复启动

  const pythonExe = findPythonExe();
  const serverPath = path.join(PROJECT_BASE, "api", "server.py");

  console.log("[Electron] Starting Python:", pythonExe);

  pyProc = spawn(pythonExe, [serverPath], {
    cwd: PROJECT_BASE,
    stdio: "pipe",
  });

  pyProc.stdout.on("data", (d) => console.log("[PY]", d.toString().trim()));
  pyProc.stderr.on("data", (d) => console.log("[PY-ERR]", d.toString().trim()));
  pyProc.on("exit", (code) => console.log("[PY] exited code:", code));
}

function stopPythonApi() {
  if (pyProc && !pyProc.killed) {
    console.log("[Electron] Killing Python process...");
    pyProc.kill();
    pyProc = null;
  }
}

// --- Helper ---
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

  // 🟢 1. 从 Store 读取上次的位置和大小
  const bounds: any = store.get("windowBounds", {
    width: 1440,
    height: 900,
  });

  win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x, // 如果 undefined，Electron 会自动居中
    y: bounds.y,
    minWidth: 1024, // 建议设置最小宽度，防止布局崩坏
    minHeight: 720,
    autoHideMenuBar: true, // 🟢 5. 隐藏默认菜单栏
    frame: true, // 保持系统标题栏 (或者 false 用自定义)
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // 🟢 1. 监听调整大小和移动，保存状态
  const saveState = () => {
    if (!win) return;
    store.set("windowBounds", win.getBounds());
  };
  win.on("resize", saveState);
  win.on("move", saveState);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    // win.webContents.openDevTools({ mode: "detach" }); // 开发时可开启
  } else {
    // 生产环境加载 index.html
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// --- App Lifecycle ---

app.on("window-all-closed", () => {
  stopPythonApi();
  if (process.platform !== "darwin") app.quit();
});

// 🟢 3. 额外保险：退出前清理进程
app.on("before-quit", () => {
  stopPythonApi();
});

app.whenReady().then(async () => {
  startPythonApi();

  // IPC Handlers
  ipcMain.handle("galrec:getApiBase", async () => {
    try {
      const rt = await waitForApiReady(15000);
      return rt.api_base;
    } catch (e) {
      console.error(e);
      return "";
    }
  });

  // 🟢 2. 注册 ROI 相关的 IPC (让前端能调起截图层)
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
