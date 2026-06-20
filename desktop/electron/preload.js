// Secure bridge between the renderer overlay and the main process.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("continuum", {
  onState: (cb) => ipcRenderer.on("agent:state", (_e, state) => cb(state)),
  toggle: () => ipcRenderer.invoke("agent:toggle"),
});
