const test = require("node:test");
const assert = require("node:assert");
const { parseDsn, buildEvent } = require("./sentry");

test("parseDsn: extracts key, host, project id, and store url", () => {
  const out = parseDsn("https://abc123@o42.ingest.sentry.io/567");
  assert.strictEqual(out.publicKey, "abc123");
  assert.strictEqual(out.host, "o42.ingest.sentry.io");
  assert.strictEqual(out.projectId, "567");
  assert.strictEqual(out.storeUrl, "https://o42.ingest.sentry.io/api/567/store/");
});

test("parseDsn: returns null for empty or malformed DSNs", () => {
  assert.strictEqual(parseDsn(""), null);
  assert.strictEqual(parseDsn(null), null);
  assert.strictEqual(parseDsn("not a url"), null);
  // Missing public key.
  assert.strictEqual(parseDsn("https://o42.ingest.sentry.io/567"), null);
  // Missing project id.
  assert.strictEqual(parseDsn("https://abc123@o42.ingest.sentry.io/"), null);
});

test("buildEvent: wraps an Error into a Sentry exception event", () => {
  const event = buildEvent(new TypeError("boom"), { tags: { stage: "capture" } });
  assert.match(event.event_id, /^[0-9a-f]{32}$/);
  assert.strictEqual(event.level, "error");
  assert.strictEqual(event.exception.values[0].type, "TypeError");
  assert.strictEqual(event.exception.values[0].value, "boom");
  assert.strictEqual(event.tags.stage, "capture");
  assert.ok(typeof event.timestamp === "string");
});

test("buildEvent: coerces a non-Error value into an event", () => {
  const event = buildEvent("plain string failure");
  assert.strictEqual(event.exception.values[0].value, "plain string failure");
  assert.strictEqual(event.exception.values[0].type, "Error");
});
