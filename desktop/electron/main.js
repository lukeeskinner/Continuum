// Continuum desktop agent — Electron main process.
//
// Responsibilities:
//   1. Authenticate the user (Supabase) and resolve their identity + Letta agent.
//   2. Capture desktop frames via desktopCapturer (only on visual deltas).
//   3. Send frames to the Python moondream2 sidecar for descriptor extraction.
//   4. Run the privacy/PII filter and route the result (BLOCKED/LOCAL_ONLY/
//      SHARED_ANON) to the user's Letta agent.
//   5. Render an ambient glassmorphic status overlay.
// Load desktop/.env before anything reads process.env (config.js depends on it).
require("./env").loadEnv();

const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  systemPreferences,
  shell,
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
// Single-flight guard: moondream inference can exceed the capture interval, so
// we never start a new analysis while one is still running.
let inFlight = false;

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
  if (paused || inFlight || !sidecar) return;
  inFlight = true;
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const screen = sources[0];
    if (!screen || screen.thumbnail.isEmpty()) return;

    const png = screen.thumbnail.toPNG();
    const signature = frameSignature(png);
    if (!hasChanged(signature)) return;
    lastFrameSignature = signature;

    const descriptor = await sidecar.analyze(png.toString("base64"));
    if (!descriptor) return;

    await handleDescriptor(descriptor);
  } catch (err) {
    console.error("[capture] error:", err);
  } finally {
    inFlight = false;
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

  const runningItems = [
    {
      label: overlay?.isVisible() ? "Hide panel" : "Show panel",
      click: () => {
        if (!overlay) createOverlay();
        else if (overlay.isVisible()) overlay.hide();
        else overlay.show();
        rebuildTrayMenu();
      },
    },
    {
      label: paused ? "Resume capture" : "Pause capture",
      click: () => togglePause(),
    },
    { type: "separator" },
    {
      label: "Sign out",
      click: async () => {
        stopAgent();
        await auth.signOut().catch(() => {});
        createLoginWindow();
        rebuildTrayMenu();
      },
    },
  ];

  // When not running (signed out), offer a way back in instead of dead items.
  const signedOutItems = [
    {
      label: "Sign in…",
      click: () => {
        if (loginWindow) loginWindow.focus();
        else createLoginWindow();
      },
    },
  ];

  const menu = Menu.buildFromTemplate([
    ...(running ? runningItems : signedOutItems),
    { type: "separator" },
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

// Pure check: does the OS currently allow screen capture? (Always true off mac.)
function hasScreenPermission() {
  if (process.platform !== "darwin") return true;
  return systemPreferences.getMediaAccessStatus("screen") === "granted";
}

// One-time guidance: surface the missing permission in the overlay and open the
// relevant System Settings pane. Returns whether permission is already granted.
function ensureScreenPermission() {
  if (hasScreenPermission()) return true;
  console.warn("[permission] screen recording not granted");
  notifyOverlay({
    decision: "BLOCKED",
    descriptor: {
      app: "Continuum",
      concept: "Grant Screen Recording permission in System Settings, then restart.",
    },
  });
  shell
    .openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    )
    .catch(() => {});
  return false;
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
  // Show the overlay first so the permission guidance is visible, then gate
  // capture on the OS permission.
  const hasPermission = ensureScreenPermission();

  sidecar = new Sidecar();
  sidecar.start();
  paused = false;
  inFlight = false;
  lastFrameSignature = null;
  if (hasPermission) {
    captureTimer = setInterval(captureLoop, config.captureIntervalMs);
  } else {
    // Keep the sidecar alive but don't capture until permission is granted.
    // Poll quietly (no repeated System Settings prompts) and switch over once
    // the user grants access.
    captureTimer = setInterval(() => {
      if (hasScreenPermission()) {
        clearInterval(captureTimer);
        captureTimer = setInterval(captureLoop, config.captureIntervalMs);
        notifyOverlay({
          decision: "SHARED_ANON",
          descriptor: { app: "Continuum", concept: "Screen capture active." },
        });
        rebuildTrayMenu();
      }
    }, 5000);
  }
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

// Enforce a single running instance; focus the existing one on relaunch.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (loginWindow) {
      loginWindow.show();
      loginWindow.focus();
    } else if (overlay) {
      overlay.show();
    }
  });

  app.whenReady().then(async () => {
    // Ambient menu-bar agent: no dock icon on macOS.
    app.dock?.hide();
    createTray();
    const authed = await auth.isAuthenticated().catch(() => false);
    if (authed) {
      await startAgent();
    } else {
      createLoginWindow();
    }
  });
}

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
