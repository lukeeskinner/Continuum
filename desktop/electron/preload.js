// Secure bridge between the renderer windows and the main process.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("continuum", {
  // Overlay
  onState: (cb) => ipcRenderer.on("agent:state", (_e, state) => cb(state)),
  toggle: () => ipcRenderer.invoke("agent:toggle"),
  // Auth
  status: () => ipcRenderer.invoke("auth:status"),
  signIn: (email, password) =>
    ipcRenderer.invoke("auth:signIn", { email, password }),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
});
