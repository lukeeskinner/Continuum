// Privacy & PII filter. Classifies each visual descriptor and scrubs identity
// details before any data leaves the device.
//
// classify(descriptor, ctx) returns one of:
//   "BLOCKED"      — dropped on-device, never stored or sent.
//   "LOCAL_ONLY"   — stored in the local buffer only; never reaches the graph.
//   "SHARED_ANON"  — scrubbed and pushed to the team graph.
//
// ctx (all optional):
//   bundleId     — focused app's macOS bundle id (from frontApp.js).
//   appName      — focused app's display name.
//   privateMode  — user has toggled manual Private Mode (privacy:toggle).
const config = require("./config");

const BLOCK_PATTERNS = [
  /password/i,
  /bank|chase|wellsfargo|paypal|venmo/i,
  /whatsapp|imessage|messenger|signal/i,
  /credit\s?card|ssn|social security/i,
];

const LOCAL_ONLY_PATTERNS = [/salary|compensation|offer letter/i, /personal|private/i];

// Sensitive applications blocked by OS bundle id, regardless of on-screen text.
// Matches an entry exactly or as a prefix (entry + ".") to also catch helper
// processes (e.g. com.1password.1password-helper). Extend at runtime with
// PRIVACY_BLOCK_BUNDLES (see config.js).
const BUNDLE_BLOCKLIST = [
  // Password managers
  "com.agilebits.onepassword",
  "com.1password.1password",
  "com.lastpass.lastpass",
  "com.bitwarden.desktop",
  "com.apple.keychainaccess",
  // Private messaging
  "net.whatsapp.whatsapp",
  "com.apple.mobilesms", // Messages
  "org.whispersystems.signal-desktop",
  "ru.keepcoder.telegram",
  "org.telegram.desktop",
  // Banking / finance
  "com.intuit.quickbooks",
  "com.paypal.here",
];

function isBlockedBundle(bundleId) {
  if (!bundleId) return false;
  const id = bundleId.toLowerCase();
  const list = BUNDLE_BLOCKLIST.concat(config.blockBundles || []);
  return list.some((e) => id === e || id.startsWith(`${e}.`));
}

function classify(descriptor, ctx = {}) {
  const { bundleId = null, appName = null, privateMode = false } = ctx;

  // 1. Hard block: sensitive app by bundle id, or sensitive content by keyword.
  if (isBlockedBundle(bundleId)) return "BLOCKED";
  const blob = `${JSON.stringify(descriptor)} ${appName ?? ""}`.toLowerCase();
  if (BLOCK_PATTERNS.some((re) => re.test(blob))) return "BLOCKED";

  // 2. Manual Private Mode: nothing is shared with the team graph.
  if (privateMode) return "LOCAL_ONLY";

  // 3. Personal-but-not-secret content stays on-device.
  if (LOCAL_ONLY_PATTERNS.some((re) => re.test(blob))) return "LOCAL_ONLY";

  // 4. Default: shareable work context (scrubbed before it leaves).
  return "SHARED_ANON";
}

// Strip identity-revealing details from a SHARED_ANON descriptor.
function scrub(descriptor) {
  const clean = { ...descriptor };
  for (const key of Object.keys(clean)) {
    if (typeof clean[key] !== "string") continue;
    clean[key] = clean[key]
      // home directory paths -> ~
      .replace(/\/(Users|home)\/[^/\s]+/g, "~")
      // emails -> <email>
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
      // long tokens / hashes -> <token>
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "<token>");
  }
  return clean;
}

module.exports = { classify, scrub, isBlockedBundle, BUNDLE_BLOCKLIST };
