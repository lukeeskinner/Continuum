// Python sidecar orchestrator. Spawns the moondream2 process and exchanges
// newline-delimited JSON over stdin/stdout:
//   -> { "frame": "<base64 png>" }
//   <- { "app": ..., "topic": ..., "concept": ..., "error_type": ... }
const { spawn } = require("child_process");
const path = require("path");
const config = require("./config");

class Sidecar {
  constructor() {
    this.proc = null;
    this.buffer = "";
    this.pending = [];
  }

  start() {
    const script = path.resolve(__dirname, "..", config.sidecarScript);
    this.proc = spawn(config.pythonPath, [script], {
      stdio: ["pipe", "pipe", "inherit"],
    });

    this.proc.stdout.on("data", (chunk) => this._onData(chunk));
    this.proc.on("exit", (code) => {
      console.error(`[sidecar] exited with code ${code}`);
      this.proc = null;
    });
  }

  _onData(chunk) {
    this.buffer += chunk.toString();
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      const resolve = this.pending.shift();
      try {
        const descriptor = JSON.parse(line);
        resolve?.(descriptor);
      } catch (err) {
        console.error("[sidecar] bad json:", line, err);
        resolve?.(null);
      }
    }
  }

  // Send a base64 PNG frame, resolve with the descriptor.
  analyze(base64Png) {
    if (!this.proc) throw new Error("sidecar not running");
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.proc.stdin.write(JSON.stringify({ frame: base64Png }) + "\n");
    });
  }

  stop() {
    this.proc?.kill();
    this.proc = null;
  }
}

module.exports = { Sidecar };
