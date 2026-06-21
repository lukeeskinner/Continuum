// macOS frontmost-app detector.
//
// Reports the focused application's bundle id + display name so the privacy
// filter can block by bundle id (password managers, banking, private
// messaging) independently of whatever the vision model happens to name on
// screen.
//
// Uses `lsappinfo`, which — unlike scripting System Events — does NOT require
// Accessibility permission. Best-effort: returns null on non-macOS or any
// failure, so the caller transparently falls back to keyword classification.
const { execFile } = require("child_process");

const CACHE_TTL_MS = 1500; // don't respawn lsappinfo on every rapid call
let cache = { at: 0, value: null };

function parse(stdout) {
  const bundleId = /"CFBundleIdentifier"="([^"]*)"/.exec(stdout)?.[1] || null;
  const name = /"LSDisplayName"="([^"]*)"/.exec(stdout)?.[1] || null;
  if (!bundleId && !name) return null;
  return { bundleId, name };
}

function getFrontmost() {
  if (process.platform !== "darwin") return Promise.resolve(null);

  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.value);

  return new Promise((resolve) => {
    execFile(
      "/bin/sh",
      ["-c", 'asn=$(lsappinfo front); lsappinfo info -only bundleID -only name "$asn"'],
      { timeout: 2000 },
      (err, stdout) => {
        const value = err ? null : parse(stdout);
        cache = { at: Date.now(), value };
        resolve(value);
      },
    );
  });
}

module.exports = { getFrontmost, _parse: parse };
