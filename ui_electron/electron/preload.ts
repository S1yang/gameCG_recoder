import { contextBridge, ipcRenderer } from "electron";

console.log("[preload] loaded");

contextBridge.exposeInMainWorld("galrec", {
  getApiBase: async () => ipcRenderer.invoke("galrec:getApiBase"),
  openRoi: () => ipcRenderer.invoke("roi-open"),
  onRoiResult: (
    cb: (roi: null | { x: number; y: number; w: number; h: number }) => void
  ) => {
    ipcRenderer.removeAllListeners("roi-result");
    ipcRenderer.on("roi-result", (_, roi) => cb(roi));
  },
});
