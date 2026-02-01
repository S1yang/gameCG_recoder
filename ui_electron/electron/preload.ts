import { contextBridge, ipcRenderer } from "electron";

console.log("[preload] loaded");

contextBridge.exposeInMainWorld("galrec", {
  getApiBase: async () => ipcRenderer.invoke("galrec:getApiBase"),

  // ✅ 对齐 main.ts 的 channel
  openRoi: async () => ipcRenderer.invoke("galrec:openRoiOverlay"),
  closeRoi: async () => ipcRenderer.invoke("galrec:closeRoiOverlay"),

  onRoiResult: (
    cb: (roi: null | { x: number; y: number; w: number; h: number }) => void
  ) => {
    ipcRenderer.removeAllListeners("roi-result");
    ipcRenderer.on("roi-result", (_, roi) => cb(roi));
  },
});
