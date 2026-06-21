#!/usr/bin/env node
// Smoke test for the Claude-vision sidecar.
//
// Exercises the exact stdin/stdout contract the Electron main process uses:
// writes a `{ "frame": "<base64 png>" }` line and expects a single descriptor
// JSON line back with the keys { app, topic, concept, error_type }.
//
// This validates the IPC protocol and graceful-fallback behaviour without
// requiring a valid ANTHROPIC_API_KEY: if the key is missing/invalid or the
// `anthropic` package is unavailable, the sidecar still emits a well-formed
// fallback descriptor, which is what this test asserts.
//
// Usage: node scripts/test-sidecar.js
//        PYTHON_PATH=desktop/sidecar/.venv/bin/python3 node scripts/test-sidecar.js
const { spawn } = require("child_process");
const path = require("path");

// A valid 1x1 transparent PNG.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const pythonPath = process.env.PYTHON_PATH || "python3";
const script = path.resolve(
  __dirname,
  "..",
  process.env.SIDECAR_SCRIPT || "desktop/sidecar/sidecar.py",
);
const REQUIRED_KEYS = ["app", "topic", "concept", "error_type"];
const TIMEOUT_MS = 120_000; // first run may lazily load the model.

function main() {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [script], { stdio: ["pipe", "pipe", "inherit"] });
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      reject(new Error(`sidecar did not respond within ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`failed to spawn '${pythonPath}': ${err.message}`));
    });

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const idx = buffer.indexOf("\n");
      if (idx < 0 || settled) return;
      settled = true;
      clearTimeout(timer);
      const line = buffer.slice(0, idx).trim();
      proc.kill();
      try {
        const descriptor = JSON.parse(line);
        const missing = REQUIRED_KEYS.filter((k) => !(k in descriptor));
        if (missing.length > 0) {
          reject(new Error(`descriptor missing keys: ${missing.join(", ")} (got: ${line})`));
          return;
        }
        console.log("sidecar descriptor:", JSON.stringify(descriptor));
        console.log("OK: sidecar honored the frame->descriptor contract");
        resolve();
      } catch (err) {
        reject(new Error(`sidecar emitted invalid JSON: ${line} (${err.message})`));
      }
    });

    proc.stdin.write(JSON.stringify({ frame: TINY_PNG_B64 }) + "\n");
  });
}

main().catch((err) => {
  console.error("sidecar smoke test failed:", err.message);
  process.exit(1);
});
