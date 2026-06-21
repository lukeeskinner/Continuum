const { test } = require("node:test");
const assert = require("node:assert");
const cp = require("./capturePolicy");

const CFG = {
  captureIntervalMs: 4000,
  idleIntervalMs: 16000,
  idlePauseSeconds: 30,
  deepIdleSeconds: 300,
  deepIdlePollMs: 5000,
  maxBackoffMs: 60000,
};

test("bgraToGray: luminance from a BGRA buffer", () => {
  // One white + one black pixel (BGRA).
  const buf = Buffer.from([255, 255, 255, 255, 0, 0, 0, 255]);
  const gray = cp.bgraToGray(buf);
  assert.equal(gray.length, 2);
  assert.equal(gray[0], 255);
  assert.equal(gray[1], 0);
});

test("averageHash + hammingDistance", () => {
  const a = cp.averageHash(Uint8Array.from([0, 0, 255, 255])); // bits 0011
  const b = cp.averageHash(Uint8Array.from([0, 0, 255, 255]));
  assert.equal(cp.hammingDistance(a, b), 0);
  const c = cp.averageHash(Uint8Array.from([255, 255, 0, 0])); // bits 1100
  assert.equal(cp.hammingDistance(a, c), 4);
});

test("FrameDeduper: first frame is new, identical is duplicate", () => {
  const d = new cp.FrameDeduper({ threshold: 6 });
  assert.equal(d.isDuplicate(0b1010n), false);
  assert.equal(d.isDuplicate(0b1010n), true); // identical
});

test("FrameDeduper: a very different frame is not a duplicate", () => {
  const d = new cp.FrameDeduper({ threshold: 6 });
  d.isDuplicate(0n);
  // 0xFFFFFFFFFFFFFFFF differs in 64 bits -> well above threshold.
  assert.equal(d.isDuplicate((1n << 64n) - 1n), false);
});

test("FrameDeduper: detects A->B->A flip via history", () => {
  const d = new cp.FrameDeduper({ threshold: 6, historySize: 8 });
  const A = 0n;
  const B = (1n << 40n) - 1n; // far from A
  assert.equal(d.isDuplicate(A), false);
  assert.equal(d.isDuplicate(B), false);
  assert.equal(d.isDuplicate(A), true); // A seen before -> duplicate loop
});

test("captureDelayMs: active / blended idle / deep idle", () => {
  assert.equal(cp.captureDelayMs(0, CFG), 4000); // active
  assert.equal(cp.captureDelayMs(30, CFG), 4000); // at pause threshold
  assert.equal(cp.captureDelayMs(300, CFG), 5000); // deep idle -> poll
  const mid = cp.captureDelayMs(165, CFG); // halfway between 30 and 300
  assert.ok(mid > 4000 && mid < 16000, `expected blended, got ${mid}`);
});

test("isDeepIdle", () => {
  assert.equal(cp.isDeepIdle(299, CFG), false);
  assert.equal(cp.isDeepIdle(300, CFG), true);
});

test("backoffDelayMs: exponential, capped", () => {
  assert.equal(cp.backoffDelayMs(4000, 0, CFG), 4000);
  assert.equal(cp.backoffDelayMs(4000, 1, CFG), 8000);
  assert.equal(cp.backoffDelayMs(4000, 3, CFG), 32000);
  assert.equal(cp.backoffDelayMs(4000, 10, CFG), 60000); // capped at maxBackoffMs
});

test("descriptorKey: stable, case-insensitive, prefers bundle id", () => {
  const k = cp.descriptorKey({ app: "VS Code", topic: "Rust", concept: "Tokio" }, { bundleId: "com.microsoft.VSCode" });
  assert.equal(k, "com.microsoft.vscode|rust|tokio");
  // No front app -> falls back to descriptor.app.
  assert.equal(cp.descriptorKey({ app: "Terminal", topic: "x" }), "terminal|x|");
});

test("SemanticDeduper: repeats within window are skipped, forced refresh passes", () => {
  const d = new cp.SemanticDeduper({ windowMs: 1000, forceMs: 5000 });
  const k = "app|topic|concept";
  assert.equal(d.shouldSkip(k, 0), false); // first
  assert.equal(d.shouldSkip(k, 500), true); // within window
  assert.equal(d.shouldSkip(k, 1600), false); // window elapsed -> fresh
  // Hammer it within window until forceMs elapses since firstSeen(=1600).
  assert.equal(d.shouldSkip(k, 2000), true);
  assert.equal(d.shouldSkip(k, 6700), false); // >= forceMs since firstSeen -> forced
});

test("SemanticDeduper: empty key never skips", () => {
  const d = new cp.SemanticDeduper();
  assert.equal(d.shouldSkip("", 0), false);
});
