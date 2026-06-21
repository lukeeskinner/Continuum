const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const store = require("./store");
const queryEngine = require("./queryEngine");

const dbFile = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "continuum-qe-")),
  "buffer.db",
);

// The hub (query-synthesize) is unconfigured in the test env (no SUPABASE_*),
// so hub.querySynthesize() throws and the engine falls back to local memory.
test("query engine local fallback", async (t) => {
  await store.init({ file: dbFile });
  store.insertObservation({
    decision: "SHARED_ANON",
    descriptor: { app: "VS Code", topic: "rust async", concept: "tokio" },
    synced: true,
  });

  await t.test("blank query returns a prompt with no citations", async () => {
    const r = await queryEngine.answer("   ");
    assert.deepEqual(r.citations, []);
    assert.match(r.response, /work/i);
  });

  await t.test("matching query returns local summary + citations", async () => {
    const r = await queryEngine.answer("rust");
    assert.strictEqual(r.citations.length, 1);
    assert.strictEqual(r.citations[0].app, "VS Code");
    assert.strictEqual(r.citations[0].source, "local");
    assert.match(r.response, /VS Code/);
  });

  await t.test("no local match returns a helpful empty message", async () => {
    const r = await queryEngine.answer("nonexistent-topic-xyz");
    assert.deepEqual(r.citations, []);
    assert.match(r.response, /nothing on this device/i);
  });

  store.close();
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});
