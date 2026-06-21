// Secure bridge between the renderer windows and the main process.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("continuum", {
  // Overlay
  onState: (cb) => ipcRenderer.on("agent:state", (_e, state) => cb(state)),
  toggle: () => ipcRenderer.invoke("agent:toggle"),
  // Privacy / Private Mode
  togglePrivate: () => ipcRenderer.invoke("privacy:toggle"),
  onPrivacy: (cb) => ipcRenderer.on("agent:privacy", (_e, state) => cb(state)),
  // Inbound team activity
  onTeamEvent: (cb) => ipcRenderer.on("team:event", (_e, event) => cb(event)),
  // Auth
  status: () => ipcRenderer.invoke("auth:status"),
  signIn: (email, password) =>
    ipcRenderer.invoke("auth:signIn", { email, password }),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
  // Command bar (query)
  query: (text) => ipcRenderer.send("query:ask", text),
  hideQuery: () => ipcRenderer.send("query:hide"),
  onQueryResponse: (cb) => ipcRenderer.on("query:response", (_e, res) => cb(res)),
  onQueryShow: (cb) => ipcRenderer.on("query:show", () => cb()),
  // Command bar (Deepgram voice in/out)
  ensureMic: () => ipcRenderer.invoke("voice:ensureMic"),
  transcribe: (bytes, mime) =>
    ipcRenderer.invoke("voice:transcribe", { bytes, mime }),
  speak: (text) => ipcRenderer.invoke("voice:speak", text),
});
