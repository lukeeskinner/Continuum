// Continuum desktop agent — Electron main process.
//
// Responsibilities:
//   1. Authenticate the user (Supabase) and resolve their identity + Letta agent.
//   2. Capture desktop frames via desktopCapturer (idle-aware cadence;
//      perceptual-hash + semantic dedup; blocked apps gated before vision).
//   3. Send frames to the Python Claude-vision sidecar for descriptor extraction.
//   4. Run the privacy/PII filter (with focused-app + Private Mode context) and
//      route the result (BLOCKED/LOCAL_ONLY/SHARED_ANON) to the local buffer,
//      the user's Letta agent, and — for SHARED_ANON — the team graph.
//   5. Render an ambient glassmorphic status overlay + a Spotlight-style command
//      bar that asks the team graph (with Deepgram voice in/out).
//   6. Reflect inbound team activity (teammates' nodes + detected connections).
// Load desktop/.env before anything reads process.env (config.js depends on it).
require("./env").loadEnv();

const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  powerMonitor,
  session,
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
const capturePolicy = require("./capturePolicy");
const letta = require("./letta");
const sync = require("./sync");
const browserbase = require("./browserbase");
const auth = require("./auth");
const store = require("./store");
const frontApp = require("./frontApp");
const queryEngine = require("./queryEngine");
const hub = require("./hub");
const realtime = require("./realtime");

let overlay = null;
let loginWindow = null;
let queryWindow = null;
let tray = null;
let sidecar = null;
let captureTimeout = null; // self-scheduling, idle-aware capture loop
let retryTimer = null;
let agentRunning = false; // signed in + capture loop scheduled
let captureActive = false; // emitted the one-time "capture active" notice
let consecutiveErrors = 0; // drives exponential backoff on pipeline errors
let paused = false;
// Manual Private Mode: nothing is shared with the team graph while on.
let privateMode = false;
let storeReady = false;
let teammateNames = {};
// Single-flight guard: vision inference can exceed the capture interval, so we
// never start a new analysis while one is still running.
let inFlight = false;

// Skip visually-unchanged frames (perceptual hash) and repeated identical
// descriptors within a window (semantic) — both avoid needless paid vision calls.
const deduper = new capturePolicy.FrameDeduper({ threshold: config.hashThreshold });
const semanticDeduper = new capturePolicy.SemanticDeduper({
  windowMs: config.semanticDedupWindowMs,
  forceMs: config.semanticForceMs,
});

// How often we retry SHARED_ANON observations that failed to reach the graph.
const RETRY_INTERVAL_MS = 20_000;

function createOverlay() {
  overlay = new BrowserWindow({
    width: 320,
    height: 500,
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
  overlay.webContents.once("did-finish-load", () => {
    overlay?.webContents.send("agent:privacy", { privateMode });
  });
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

// Spotlight-style command bar. Created hidden and summoned by the global
// shortcut; dismissed on Escape or focus loss.
function createQueryWindow() {
  queryWindow = new BrowserWindow({
    width: 640,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  queryWindow.loadFile(path.join(__dirname, "..", "renderer", "query.html"));
  queryWindow.on("blur", () => queryWindow?.hide());
  queryWindow.on("closed", () => (queryWindow = null));
}

function toggleQuery() {
  if (!queryWindow) createQueryWindow();
  if (queryWindow.isVisible()) {
    queryWindow.hide();
    return;
  }
  queryWindow.center();
  queryWindow.show();
  queryWindow.focus();
  queryWindow.webContents.send("query:show");
}

function safeIdleSeconds() {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch {
    return 0;
  }
}

// 8×8 grayscale average hash of the current frame — a reliable perceptual
// signature (unlike summing the PNG-compressed bytes, which doesn't track
// visual change). Returns a 64-bit BigInt, or null on failure.
function frameHash(image) {
  try {
    const small = image.resize({ width: 8, height: 8, quality: "good" });
    return capturePolicy.averageHash(capturePolicy.bgraToGray(small.toBitmap()));
  } catch (err) {
    console.error("[capture] hash failed:", err);
    return null;
  }
}

// Schedule the next capture with an idle-aware delay plus error backoff. This
// replaces a fixed setInterval so the cadence relaxes when the user is idle.
function scheduleCapture() {
  if (!agentRunning) return;
  clearTimeout(captureTimeout);
  const base = capturePolicy.captureDelayMs(safeIdleSeconds(), config);
  const delay = capturePolicy.backoffDelayMs(base, consecutiveErrors, config);
  captureTimeout = setTimeout(captureTick, delay);
}

// One capture attempt. Cheap pre-vision gates (permission, deep-idle,
// perceptual dedup, focused-app privacy block) avoid paying for a Claude
// vision call whenever we don't actually need one.
async function captureTick() {
  captureTimeout = null;
  if (!agentRunning) return;
  if (paused || inFlight || !sidecar) {
    scheduleCapture();
    return;
  }

  // Wait (cheaply) until Screen Recording is granted; never re-prompt here.
  if (!hasScreenPermission()) {
    scheduleCapture();
    return;
  }
  if (!captureActive) {
    captureActive = true;
    notifyOverlay({
      decision: "SHARED_ANON",
      descriptor: { app: "Continuum", concept: "Screen capture active." },
    });
  }

  // Deep idle: don't capture at all, just keep polling for the user's return.
  if (capturePolicy.isDeepIdle(safeIdleSeconds(), config)) {
    scheduleCapture();
    return;
  }

  inFlight = true;
  let hadError = false;
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const screen = sources[0];
    if (!screen || screen.thumbnail.isEmpty()) return;

    // Reliable perceptual-hash dedup: skip visually-unchanged frames.
    const hash = frameHash(screen.thumbnail);
    if (hash !== null && deduper.isDuplicate(hash)) return;

    // Pre-vision privacy gate: a blocked app's screen never reaches the cloud.
    const front = await frontApp.getFrontmost().catch(() => null);
    if (privacy.isBlockedBundle(front?.bundleId)) {
      notifyOverlay({
        decision: "BLOCKED",
        descriptor: {
          app: front?.name || "Private app",
          concept: "Blocked before capture (privacy).",
        },
      });
      return;
    }

    const descriptor = await sidecar.analyze(screen.thumbnail.toPNG().toString("base64"));
    if (!descriptor) {
      hadError = true;
      return;
    }

    // Semantic dedup: don't re-send an identical descriptor within the window.
    if (semanticDeduper.shouldSkip(capturePolicy.descriptorKey(descriptor, front))) return;

    await handleDescriptor(descriptor, {
      bundleId: front?.bundleId ?? null,
      appName: front?.name ?? null,
      privateMode,
    });
  } catch (err) {
    console.error("[capture] error:", err);
    hadError = true;
  } finally {
    inFlight = false;
    consecutiveErrors = hadError ? consecutiveErrors + 1 : 0;
    scheduleCapture();
  }
}

async function handleDescriptor(descriptor, ctx) {
  const decision = privacy.classify(descriptor, ctx);
  notifyOverlay({ decision, descriptor });

  if (decision === "BLOCKED") return;

  const payload = decision === "SHARED_ANON" ? privacy.scrub(descriptor) : descriptor;

  // Durable on-device record of every non-BLOCKED observation. SHARED_ANON rows
  // start unsynced so a failed push can be retried instead of lost.
  let rowId = null;
  if (storeReady) {
    try {
      rowId = store.insertObservation({ decision, descriptor: payload, synced: false });
    } catch (err) {
      console.error("[store] insert failed:", err);
    }
  }

  // Both LOCAL_ONLY and SHARED_ANON update the per-user Letta agent.
  await letta.postMessage(payload);

  // Only SHARED_ANON reaches the team graph. We push the structured descriptor
  // straight to agent-sync (deterministic) rather than relying on Letta's
  // autonomous archival promotion.
  if (decision !== "SHARED_ANON") return;
  try {
    const res = await sync.pushNode(payload);
    if (res?.node_id && rowId != null && storeReady) store.markSynced(rowId, res.node_id);
  } catch (err) {
    console.error("[sync] error:", err); // leave the row unsynced for retry
  }

  // Opt-in Browserbase enrichment: if the observation references an allowlisted
  // URL, fetch and embed the full page as a richer knowledge node.
  const url = browserbase.findEnrichableUrl(payload);
  if (url) {
    browserbase.enrich(url).catch((err) => console.error("[browserbase] error:", err));
  }
}

// Replay SHARED_ANON observations that never made it to the graph (offline /
// server error). Runs on an interval while the agent is signed in.
async function flushUnsynced() {
  if (!storeReady) return;
  let pending = [];
  try {
    pending = store.unsyncedSharedNodes(20);
  } catch {
    return;
  }
  for (const row of pending) {
    try {
      const res = await sync.pushNode(row);
      if (res?.node_id) store.markSynced(row.id, res.node_id);
    } catch {
      return; // still offline; try again next tick
    }
  }
}

function notifyOverlay(state) {
  overlay?.webContents.send("agent:state", state);
}

function notifyOverlayTeam(event) {
  overlay?.webContents.send("team:event", event);
}

function togglePause() {
  paused = !paused;
  rebuildTrayMenu();
  return paused;
}

function setPrivateMode(on) {
  privateMode = Boolean(on);
  overlay?.webContents.send("agent:privacy", { privateMode });
  rebuildTrayMenu();
  return privateMode;
}

function rebuildTrayMenu() {
  if (!tray) return;
  const running = agentRunning;

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
      label: "Ask Continuum…",
      accelerator: config.queryShortcut,
      click: () => toggleQuery(),
    },
    {
      label: paused ? "Resume capture" : "Pause capture",
      click: () => togglePause(),
    },
    {
      label: "Private Mode",
      type: "checkbox",
      checked: privateMode,
      click: (item) => setPrivateMode(item.checked),
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

// Initialise the local SQLite buffer. Failure is non-fatal: persistence,
// citations and the offline retry queue are simply disabled.
async function initStore() {
  try {
    await store.init({
      file: path.join(app.getPath("userData"), "continuum-buffer.db"),
      wasmDir: app.isPackaged
        ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sql.js", "dist")
        : undefined,
    });
    storeReady = true;
  } catch (err) {
    console.error("[store] init failed; running without local buffer:", err);
    storeReady = false;
  }
}

// Subscribe to inbound team activity and forward it to the overlay.
async function startRealtime() {
  if (!config.clusterId) return;
  try {
    teammateNames = await auth.getMemberNames(config.clusterId).catch(() => ({}));
    await realtime.start({
      clusterId: config.clusterId,
      userId: config.userId,
      nameFor: (uid) => teammateNames[uid] || "A teammate",
      onEvent: notifyOverlayTeam,
    });
  } catch (err) {
    console.error("[realtime] start failed:", err);
  }
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

  await initStore();
  createOverlay();
  // Show the overlay first so the permission guidance is visible, then prompt
  // for the OS permission once. captureTick() polls for the grant itself.
  ensureScreenPermission();

  sidecar = new Sidecar();
  sidecar.start();
  paused = false;
  inFlight = false;
  consecutiveErrors = 0;
  captureActive = false;
  deduper.reset();
  semanticDeduper.reset();

  // Self-scheduling, idle-aware capture loop (relaxes cadence when idle, pauses
  // when deeply idle, backs off on errors).
  agentRunning = true;
  scheduleCapture();

  // Offline retry queue + inbound team feed.
  retryTimer = setInterval(flushUnsynced, RETRY_INTERVAL_MS);
  flushUnsynced();
  startRealtime();

  // Global command-bar shortcut (Spotlight-style). Pre-create the window so the
  // first summon is instant.
  registerQueryShortcut();
  if (!queryWindow) createQueryWindow();

  rebuildTrayMenu();
}

function registerQueryShortcut() {
  try {
    if (!globalShortcut.isRegistered(config.queryShortcut)) {
      globalShortcut.register(config.queryShortcut, toggleQuery);
    }
  } catch (err) {
    console.error("[shortcut] registration failed:", err);
  }
}

function stopAgent() {
  agentRunning = false;
  clearTimeout(captureTimeout);
  captureTimeout = null;
  clearInterval(retryTimer);
  retryTimer = null;
  globalShortcut.unregister(config.queryShortcut);
  realtime.stop().catch(() => {});
  sidecar?.stop();
  sidecar = null;
  queryWindow?.hide();
  overlay?.close();
  rebuildTrayMenu();
}

// Allow microphone use for our renderer windows (the command bar's push-to-talk).
function configureMediaPermissions() {
  const handler = (_wc, permission, callback) =>
    callback(permission === "media" || permission === "microphone");
  session.defaultSession.setPermissionRequestHandler(handler);
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => permission === "media" || permission === "microphone",
  );
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
    configureMediaPermissions();
    createTray();
    const authed = await auth.isAuthenticated().catch(() => false);
    if (authed) {
      await startAgent();
    } else {
      createLoginWindow();
    }
  });
}

// ── IPC: auth ───────────────────────────────────────────────────────────────
ipcMain.handle("agent:toggle", () => {
  return { paused: togglePause() };
});

ipcMain.handle("privacy:toggle", () => {
  return { privateMode: setPrivateMode(!privateMode) };
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

// ── IPC: command bar (query + voice) ─────────────────────────────────────────
ipcMain.on("query:ask", async (_e, text) => {
  const result = await queryEngine.answer(text);
  queryWindow?.webContents.send("query:response", result);
});

ipcMain.on("query:hide", () => queryWindow?.hide());

// Push-to-talk: ensure mic access (macOS TCC prompt) before the renderer records.
ipcMain.handle("voice:ensureMic", async () => {
  if (process.platform !== "darwin") return { ok: true };
  try {
    const ok = await systemPreferences.askForMediaAccess("microphone");
    return { ok };
  } catch {
    return { ok: false };
  }
});

// Transcribe a recorded clip via the hub (Deepgram). `bytes` is an ArrayBuffer.
ipcMain.handle("voice:transcribe", async (_e, { bytes, mime }) => {
  try {
    const transcript = await hub.transcribe(Buffer.from(bytes), mime || "audio/webm");
    return { ok: true, transcript };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err) };
  }
});

// Synthesize the answer to speech via the hub (Deepgram aura). Returns base64 mp3.
ipcMain.handle("voice:speak", async (_e, text) => {
  try {
    const audio = await hub.speak(text);
    return { ok: true, audio: audio.toString("base64"), mime: "audio/mpeg" };
  } catch (err) {
    return { ok: false, error: String(err.message ?? err) };
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (storeReady) {
    try {
      store.close();
    } catch {
      // already closed
    }
  }
});

// With a tray, closing the panel keeps the agent resident; quit via the tray.
app.on("window-all-closed", () => {
  if (!tray && process.platform !== "darwin") app.quit();
});
