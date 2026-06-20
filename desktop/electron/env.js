// Dependency-free .env loader.
//
// Electron does not read a project .env automatically, and the agent needs its
// Letta/Supabase config present in process.env before config.js is evaluated.
// We parse desktop/.env (if present) and inject any keys that aren't already
// set in the real environment (real env vars win, so CI/shell overrides work).
const fs = require("fs");
const path = require("path");

// Parse .env file contents into a plain object. Exported for testing.
//   - ignores blank lines and # comments
//   - supports an optional leading `export `
//   - strips matching single/double quotes around values
//   - keeps inline `#` only when the value is quoted
function parseEnv(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      // Strip an inline comment for unquoted values.
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

// Load desktop/.env into process.env without clobbering existing vars.
function loadEnv(envPath = path.resolve(__dirname, "..", ".env")) {
  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    return {}; // no .env file is fine
  }
  const parsed = parseEnv(contents);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return parsed;
}

module.exports = { parseEnv, loadEnv };
