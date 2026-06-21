// Local SQLite buffer for the desktop agent.
//
// Responsibilities:
//   - Durable on-device record of every non-BLOCKED observation.
//   - LOCAL_ONLY observations live here and NEVER leave the device.
//   - SHARED_ANON observations are buffered here too, each with a `synced` flag,
//     so a push to the team graph that fails (offline, server error) can be
//     retried later instead of being lost.
//   - Backs the "recent local memory" tray view and the local-context citations
//     surfaced by the query interface.
//
// Backend: sql.js (SQLite compiled to WebAssembly). Chosen over better-sqlite3
// so the identical module loads under plain Node (unit tests) and Electron's
// Node with no native ABI rebuild. The database is held in memory and exported
// to disk after every mutation — the workload is small and append-mostly, so a
// full export per write is cheap and gives us crash durability.
const fs = require("fs");
const path = require("path");

let SQL = null; // sql.js module (lazy async init)
let db = null;
let dbFile = null;

// Resolve the directory that ships sql-wasm.wasm. Electron (packaged) overrides
// this via init({ wasmDir }) so the unpacked asar path is used instead.
function defaultWasmDir() {
  return path.dirname(require.resolve("sql.js"));
}

// Initialise the store. `file` is the on-disk DB path (omit for an ephemeral
// in-memory store, e.g. tests). Loads an existing DB if present.
async function init({ file, wasmDir } = {}) {
  if (db) return;
  dbFile = file || null;
  const dir = wasmDir || defaultWasmDir();
  const initSqlJs = require("sql.js");
  SQL = await initSqlJs({ locateFile: (f) => path.join(dir, f) });

  let bytes;
  if (dbFile && fs.existsSync(dbFile)) {
    try {
      bytes = fs.readFileSync(dbFile);
    } catch (err) {
      console.error("[store] failed to read existing db, starting fresh:", err);
    }
  }
  db = new SQL.Database(bytes && bytes.length ? bytes : undefined);
  migrate();
  persist();
}

function migrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS observations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      decision   TEXT NOT NULL,
      app        TEXT,
      topic      TEXT,
      concept    TEXT,
      error_type TEXT,
      synced     INTEGER NOT NULL DEFAULT 0,
      node_id    TEXT
    );
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_obs_ts ON observations(ts)");
  db.run("CREATE INDEX IF NOT EXISTS idx_obs_synced ON observations(synced)");
}

// Export the in-memory DB to disk. Writes to a temp file then renames so a
// crash mid-write can't corrupt the buffer.
function persist() {
  if (!dbFile) return;
  try {
    const data = Buffer.from(db.export());
    const tmp = `${dbFile}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, dbFile);
  } catch (err) {
    console.error("[store] persist failed:", err);
  }
}

function lastInsertId() {
  const res = db.exec("SELECT last_insert_rowid() AS id");
  return res.length ? res[0].values[0][0] : null;
}

// Persist a non-BLOCKED observation. Returns the new row id.
function insertObservation({ decision, descriptor, synced = false }) {
  const d = descriptor || {};
  db.run(
    `INSERT INTO observations (ts, decision, app, topic, concept, error_type, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Date.now(),
      decision,
      d.app ?? null,
      d.topic ?? null,
      d.concept ?? null,
      d.error_type ?? null,
      synced ? 1 : 0,
    ],
  );
  const id = lastInsertId();
  persist();
  return id;
}

// Flag a buffered SHARED_ANON row as pushed to the graph.
function markSynced(id, nodeId = null) {
  db.run("UPDATE observations SET synced = 1, node_id = ? WHERE id = ?", [nodeId, id]);
  persist();
}

function collect(stmt) {
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

// Most recent observations, newest first (tray "recent memory" view).
function recentObservations(limit = 20) {
  const stmt = db.prepare(
    `SELECT id, ts, decision, app, topic, concept, error_type, synced, node_id
     FROM observations ORDER BY ts DESC LIMIT ?`,
  );
  stmt.bind([limit]);
  return collect(stmt);
}

// Fuzzy match across app/topic/concept — used to attach local citations to a
// query answer.
function searchObservations(text, limit = 5) {
  const q = `%${String(text || "").trim()}%`;
  const stmt = db.prepare(
    `SELECT id, ts, decision, app, topic, concept FROM observations
     WHERE app LIKE ? OR topic LIKE ? OR concept LIKE ?
     ORDER BY ts DESC LIMIT ?`,
  );
  stmt.bind([q, q, q, limit]);
  return collect(stmt);
}

// SHARED_ANON rows that still need to reach the graph (offline retry queue).
function unsyncedSharedNodes(limit = 50) {
  const stmt = db.prepare(
    `SELECT id, app, topic, concept, error_type FROM observations
     WHERE decision = 'SHARED_ANON' AND synced = 0 ORDER BY ts ASC LIMIT ?`,
  );
  stmt.bind([limit]);
  return collect(stmt);
}

function stats() {
  const res = db.exec(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) AS synced,
       SUM(CASE WHEN decision = 'LOCAL_ONLY' THEN 1 ELSE 0 END) AS local_only
     FROM observations`,
  );
  if (!res.length) return { total: 0, synced: 0, local_only: 0 };
  const [total, synced, local_only] = res[0].values[0];
  return { total: total || 0, synced: synced || 0, local_only: local_only || 0 };
}

function close() {
  if (!db) return;
  persist();
  db.close();
  db = null;
}

module.exports = {
  init,
  insertObservation,
  markSynced,
  recentObservations,
  searchObservations,
  unsyncedSharedNodes,
  stats,
  close,
};
