const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const store = require("./store");

const dbFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "continuum-store-")),
  "buffer.db",
);

test("local buffer store", async (t) => {
  await store.init({ file: dbFile });

  let sharedId;
  await t.test("insert persists non-BLOCKED observations", () => {
    store.insertObservation({
      decision: "LOCAL_ONLY",
      descriptor: { app: "Notes", topic: "salary planning", concept: "comp" },
    });
    sharedId = store.insertObservation({
      decision: "SHARED_ANON",
      descriptor: { app: "VS Code", topic: "rust async", concept: "tokio runtime" },
      synced: false,
    });
    assert.ok(Number.isInteger(sharedId) && sharedId > 0);
  });

  await t.test("recentObservations returns newest first", () => {
    const rows = store.recentObservations(10);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].app, "VS Code"); // inserted last
    assert.strictEqual(rows[1].app, "Notes");
  });

  await t.test("searchObservations fuzzy-matches app/topic/concept", () => {
    assert.strictEqual(store.searchObservations("tokio").length, 1);
    assert.strictEqual(store.searchObservations("rust")[0].app, "VS Code");
    assert.strictEqual(store.searchObservations("nonexistent").length, 0);
  });

  await t.test("unsyncedSharedNodes only returns unsynced SHARED_ANON", () => {
    const pending = store.unsyncedSharedNodes();
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, sharedId);
  });

  await t.test("markSynced clears the retry queue", () => {
    store.markSynced(sharedId, "node-123");
    assert.strictEqual(store.unsyncedSharedNodes().length, 0);
    const row = store.recentObservations(10).find((r) => r.id === sharedId);
    assert.strictEqual(row.synced, 1);
    assert.strictEqual(row.node_id, "node-123");
  });

  await t.test("stats reflects totals", () => {
    const s = store.stats();
    assert.strictEqual(s.total, 2);
    assert.strictEqual(s.synced, 1);
    assert.strictEqual(s.local_only, 1);
  });

  await t.test("data survives a close + reopen (durability)", async () => {
    store.close();
    assert.ok(fs.existsSync(dbFile));
    await store.init({ file: dbFile });
    assert.strictEqual(store.stats().total, 2);
    assert.strictEqual(store.unsyncedSharedNodes().length, 0);
  });

  store.close();
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});
