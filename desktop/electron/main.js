// Continuum desktop agent — Electron main process.
//
// Responsibilities:
//   1. Capture desktop frames via desktopCapturer (only on visual deltas).
//   2. Send frames to the Python moondream2 sidecar for descriptor extraction.
//   3. Run the privacy/PII filter and route the result (BLOCKED/LOCAL_ONLY/
//      SHARED_ANON) to the user's Letta agent.
//   4. Render an ambient glassmorphic status overlay.
const { app, BrowserWindow, desktopCapturer, ipcMain } = require("electron");
const path = require("path");
const config = require("./config");
const { Sidecar } = require("./sidecar");
const privacy = require("./privacy");
const letta = require("./letta");

let overlay = null;
let sidecar = null;
let captureTimer = null;
let lastFrameSignature = null;
let paused = false;

function createOverlay() {
  overlay = new BrowserWindow({
    width: 320,
    height: 420,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

// Cheap perceptual signature: downsample-free mean over a sampled byte stride.
function frameSignature(buffer) {
  let sum = 0;
  const stride = Math.max(1, Math.floor(buffer.length / 4096));
  for (let i = 0; i < buffer.length; i += stride) sum += buffer[i];
  return sum;
}

function hasChanged(signature) {
  if (lastFrameSignature === null) return true;
  const delta = Math.abs(signature - lastFrameSignature);
  return delta > config.frameDeltaThreshold * 4096;
}

async function captureLoop() {
  if (paused) return;
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const screen = sources[0];
    if (!screen) return;

    const png = screen.thumbnail.toPNG();
    const signature = frameSignature(png);
    if (!hasChanged(signature)) return;
    lastFrameSignature = signature;

    const descriptor = await sidecar.analyze(png.toString("base64"));
    if (!descriptor) return;

    await handleDescriptor(descriptor);
  } catch (err) {
    console.error("[capture] error:", err);
  }
}

async function handleDescriptor(descriptor) {
  const decision = privacy.classify(descriptor);
  notifyOverlay({ decision, descriptor });

  if (decision === "BLOCKED") return;

  const payload = decision === "SHARED_ANON" ? privacy.scrub(descriptor) : descriptor;
  // Both LOCAL_ONLY and SHARED_ANON update the local Letta agent. The agent's
  // own archival webhook decides what gets promoted to the shared graph.
  await letta.postMessage(payload);
}

function notifyOverlay(state) {
  overlay?.webContents.send("agent:state", state);
}

app.whenReady().then(() => {
  createOverlay();
  sidecar = new Sidecar();
  sidecar.start();
  captureTimer = setInterval(captureLoop, config.captureIntervalMs);
});

ipcMain.handle("agent:toggle", () => {
  paused = !paused;
  return { paused };
});

app.on("window-all-closed", () => {
  clearInterval(captureTimer);
  sidecar?.stop();
  if (process.platform !== "darwin") app.quit();
});
