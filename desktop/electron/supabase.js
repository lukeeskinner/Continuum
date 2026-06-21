// Supabase client for the desktop agent. The auth session is persisted to a
// JSON file in the Electron userData directory so the user stays signed in
// across restarts (and tokens auto-refresh).
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const config = require("./config");

function sessionFile() {
  return path.join(app.getPath("userData"), "continuum-session.json");
}

// Minimal synchronous file-backed storage adapter for supabase-js auth.
const fileStorage = {
  getItem(key) {
    try {
      const store = JSON.parse(fs.readFileSync(sessionFile(), "utf8"));
      return store[key] ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    let store = {};
    try {
      store = JSON.parse(fs.readFileSync(sessionFile(), "utf8"));
    } catch {
      // no existing store
    }
    store[key] = value;
    fs.writeFileSync(sessionFile(), JSON.stringify(store), { mode: 0o600 });
  },
  removeItem(key) {
    try {
      const store = JSON.parse(fs.readFileSync(sessionFile(), "utf8"));
      delete store[key];
      fs.writeFileSync(sessionFile(), JSON.stringify(store), { mode: 0o600 });
    } catch {
      // nothing to remove
    }
  },
};

let client = null;

function supabase() {
  if (client) return client;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_ANON_KEY in desktop config; cannot authenticate.",
    );
  }
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: fileStorage,
    },
    realtime: {
      transport: WebSocket,
    },
  });
  return client;
}

module.exports = { supabase };
