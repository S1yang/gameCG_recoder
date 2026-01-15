import { contextBridge, ipcRenderer } from "electron";

console.log("[preload] loaded");

contextBridge.exposeInMainWorld("galrec", {
  getApiBase: async () => ipcRenderer.invoke("galrec:getApiBase"),
});
