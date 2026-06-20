// Continuum desktop agent — Electron main process.
//
// Responsibilities:
//   1. Authenticate the user (Supabase) and resolve their identity + Letta agent.
//   2. Capture desktop frames via desktopCapturer (only on visual deltas).
//   3. Send frames to the Python moondream2 sidecar for descriptor extraction.
//   4. Run the privacy/PII filter and route the result (BLOCKED/LOCAL_ONLY/
//      SHARED_ANON) to the user's Letta agent.
//   5. Render an ambient glassmorphic status overlay.
const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("path");
const config = require("./config");
const { Sidecar } = require("./sidecar");
const privacy = require("./privacy");
const letta = require("./letta");
const sync = require("./sync");
const browserbase = require("./browserbase");
const auth = require("./auth");

let overlay = null;
let loginWindow = null;
let tray = null;
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
  overlay.on("closed", () => (overlay = null));
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 380,
    height: 460,
    resizable: false,
    title: "Continuum — Sign in",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loginWindow.loadFile(path.join(__dirname, "..", "renderer", "login.html"));
  loginWindow.on("closed", () => (loginWindow = null));
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
  // Both LOCAL_ONLY and SHARED_ANON update the local Letta agent for per-user
  // memory.
  await letta.postMessage(payload);

  // Only SHARED_ANON reaches the team graph. We push the structured descriptor
  // straight to agent-sync (deterministic) rather than relying on Letta's
  // autonomous archival promotion.
  if (decision !== "SHARED_ANON") return;
  await sync.pushNode(payload).catch((err) => console.error("[sync] error:", err));

  // Opt-in Browserbase enrichment: if the observation references an allowlisted
  // URL, fetch and embed the full page as a richer knowledge node.
  const url = browserbase.findEnrichableUrl(payload);
  if (url) {
    browserbase.enrich(url).catch((err) => console.error("[browserbase] error:", err));
  }
}

function notifyOverlay(state) {
  overlay?.webContents.send("agent:state", state);
}

function togglePause() {
  paused = !paused;
  rebuildTrayMenu();
  return paused;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const running = captureTimer !== null;
  const menu = Menu.buildFromTemplate([
    {
      label: overlay?.isVisible() ? "Hide panel" : "Show panel",
      enabled: running,
      click: () => {
        if (!overlay) createOverlay();
        else if (overlay.isVisible()) overlay.hide();
        else overlay.show();
        rebuildTrayMenu();
      },
    },
    {
      label: paused ? "Resume capture" : "Pause capture",
      enabled: running,
      click: () => togglePause(),
    },
    { type: "separator" },
    {
      label: "Sign out",
      enabled: running,
      click: async () => {
        stopAgent();
        await auth.signOut().catch(() => {});
        createLoginWindow();
        rebuildTrayMenu();
      },
    },
    {
      label: "Quit Continuum",
      click: () => {
        stopAgent();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "..", "assets", "trayTemplate.png"),
  );
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Continuum");
  rebuildTrayMenu();
}

// Resolve identity, start the sidecar + capture loop, and show the overlay.
async function startAgent() {
  try {
    const identity = await auth.getIdentity();
    Object.assign(config, identity);
    if (!config.lettaAgentId) {
      console.warn(
        "[agent] no Letta agent linked to this profile; observations won't sync.",
      );
    }
  } catch (err) {
    console.error("[agent] identity resolution failed:", err);
  }

  createOverlay();
  sidecar = new Sidecar();
  sidecar.start();
  paused = false;
  lastFrameSignature = null;
  captureTimer = setInterval(captureLoop, config.captureIntervalMs);
  rebuildTrayMenu();
}

function stopAgent() {
  clearInterval(captureTimer);
  captureTimer = null;
  sidecar?.stop();
  sidecar = null;
  overlay?.close();
  rebuildTrayMenu();
}

app.whenReady().then(async () => {
  createTray();
  const authed = await auth.isAuthenticated().catch(() => false);
  if (authed) {
    await startAgent();
  } else {
    createLoginWindow();
  }
});

ipcMain.handle("agent:toggle", () => {
  return { paused: togglePause() };
});

ipcMain.handle("auth:status", async () => {
  return { authenticated: await auth.isAuthenticated().catch(() => false) };
});

ipcMain.handle("auth:signIn", async (_e, { email, password }) => {
  try {
    await auth.signIn(email, password);
    await startAgent();
    loginWindow?.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err) };
  }
});

ipcMain.handle("auth:signOut", async () => {
  stopAgent();
  await auth.signOut().catch(() => {});
  createLoginWindow();
  return { ok: true };
});

// With a tray, closing the panel keeps the agent resident; quit via the tray.
app.on("window-all-closed", () => {
  if (!tray && process.platform !== "darwin") app.quit();
});
