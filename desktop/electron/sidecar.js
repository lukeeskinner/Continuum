// Python sidecar orchestrator. Spawns the Claude-vision process and exchanges
// newline-delimited JSON over stdin/stdout:
//   -> { "frame": "<base64 png>" }
//   <- { "app": ..., "topic": ..., "concept": ..., "error_type": ... }
//
// Robustness:
//   - resolves the project venv's python automatically (falls back to python3)
//   - resolves the bundled script path when packaged (extraResources)
//   - per-request timeout so a hung/loading model can't leak a pending promise
//   - FIFO request/response correlation that survives timeouts
//   - auto-restart with backoff if the process dies
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const config = require("./config");

// First request lazily initialises the Anthropic client; later calls are
// network-bound. Keep a generous timeout so a slow response can't leak a
// pending promise.
const ANALYZE_TIMEOUT_MS = Number(process.env.SIDECAR_TIMEOUT_MS || 180_000);
const RESTART_BACKOFF_MS = 2_000;

// Prefer the project venv's interpreter (created by `npm run sidecar:setup`),
// then the configured PYTHON_PATH, then a bare `python3`.
function resolvePython() {
  const venv = path.resolve(__dirname, "..", "sidecar", ".venv", "bin", "python3");
  if (fs.existsSync(venv)) return venv;
  return config.pythonPath || "python3";
}

// In a packaged app the sidecar ships as an extraResource, not inside the asar.
function resolveScript() {
  if (app?.isPackaged) {
    return path.join(process.resourcesPath, "sidecar", "sidecar.py");
  }
  return path.resolve(__dirname, "..", config.sidecarScript);
}

class Sidecar {
  constructor() {
    this.proc = null;
    this.buffer = "";
    this.pending = []; // [{ resolve, timer, done }]
    this.stopped = false;
    this.restartTimer = null;
  }

  start() {
    this.stopped = false;
    const python = resolvePython();
    const script = resolveScript();
    console.log(`[sidecar] starting: ${python} ${script}`);
    try {
      this.proc = spawn(python, [script], { stdio: ["pipe", "pipe", "inherit"] });
    } catch (err) {
      console.error("[sidecar] spawn failed:", err);
      this._scheduleRestart();
      return;
    }

    this.proc.on("error", (err) => console.error("[sidecar] process error:", err));
    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    this.proc.on("exit", (code) => {
      console.error(`[sidecar] exited with code ${code}`);
      this._failAllPending();
      this.proc = null;
      if (!this.stopped) this._scheduleRestart();
    });
  }

  _scheduleRestart() {
    if (this.stopped || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      console.error("[sidecar] restarting…");
      this.start();
    }, RESTART_BACKOFF_MS);
  }

  _failAllPending() {
    while (this.pending.length) {
      const entry = this.pending.shift();
      clearTimeout(entry.timer);
      if (!entry.done) {
        entry.done = true;
        entry.resolve(null);
      }
    }
  }

  _onData(chunk) {
    this.buffer += chunk.toString();
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      const entry = this.pending.shift();
      if (!entry) continue; // unsolicited line; ignore
      clearTimeout(entry.timer);
      if (entry.done) continue; // already timed out; this is its late response

      entry.done = true;
      try {
        entry.resolve(JSON.parse(line));
      } catch (err) {
        console.error("[sidecar] bad json:", line, err);
        entry.resolve(null);
      }
    }
  }

  // Send a base64 PNG frame, resolve with the descriptor (or null on
  // failure/timeout so the caller can simply skip the frame).
  analyze(base64Png) {
    if (!this.proc || !this.proc.stdin.writable) return Promise.resolve(null);

    return new Promise((resolve) => {
      const entry = { resolve, done: false, timer: null };
      entry.timer = setTimeout(() => {
        if (!entry.done) {
          entry.done = true;
          console.error("[sidecar] analyze timed out");
          resolve(null);
        }
        // Leave the entry queued so the eventual response stays aligned (FIFO).
      }, ANALYZE_TIMEOUT_MS);

      this.pending.push(entry);
      try {
        this.proc.stdin.write(JSON.stringify({ frame: base64Png }) + "\n");
      } catch (err) {
        console.error("[sidecar] write failed:", err);
        clearTimeout(entry.timer);
        const i = this.pending.indexOf(entry);
        if (i >= 0) this.pending.splice(i, 1);
        if (!entry.done) {
          entry.done = true;
          resolve(null);
        }
      }
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this._failAllPending();
    this.proc?.kill();
    this.proc = null;
  }
}

module.exports = { Sidecar };
