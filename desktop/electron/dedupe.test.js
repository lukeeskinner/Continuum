// Unit tests for frame deduplication. Run: node --test desktop/electron/
//
// dedupe.js only depends on an object shaped like Electron's nativeImage
// (`.resize()` -> same shape, `.toBitmap()` -> BGRA Buffer), so we can test
// it with plain stubs under `node --test` (no Electron runtime needed).
const { test } = require("node:test");
const assert = require("node:assert");
const { FrameDeduper, hammingDistance } = require("./dedupe");

function solidBitmap(size, [b, g, r]) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = b;
    buf[i + 1] = g;
    buf[i + 2] = r;
    buf[i + 3] = 255;
  }
  return buf;
}

function fakeImage(color) {
  const bitmap = solidBitmap(8, color);
  return {
    resize: () => ({ toBitmap: () => bitmap }),
    toBitmap: () => bitmap,
  };
}

test("hammingDistance: counts differing bits", () => {
  assert.equal(hammingDistance(0b1010n, 0b1000n), 1);
  assert.equal(hammingDistance(0b1111n, 0b0000n), 4);
});

test("isDuplicate: first frame is never a duplicate", () => {
  const deduper = new FrameDeduper();
  assert.equal(deduper.isDuplicate(fakeImage([0, 0, 0]), Buffer.from("frame1"), 10), false);
});

test("isDuplicate: identical bytes are an exact-fingerprint duplicate", () => {
  const deduper = new FrameDeduper();
  const png = Buffer.from("same-bytes");
  deduper.isDuplicate(fakeImage([10, 10, 10]), png, 10);
  assert.equal(deduper.isDuplicate(fakeImage([10, 10, 10]), png, 10), true);
});

test("isDuplicate: similar consecutive frame is a duplicate", () => {
  const deduper = new FrameDeduper();
  deduper.isDuplicate(fakeImage([100, 100, 100]), Buffer.from("a"), 10);
  // Same color (hash distance 0, rgb distance 0) but different bytes.
  assert.equal(deduper.isDuplicate(fakeImage([100, 100, 100]), Buffer.from("b"), 10), true);
});

test("isDuplicate: very different consecutive frame is not a duplicate", () => {
  const deduper = new FrameDeduper();
  deduper.isDuplicate(fakeImage([0, 0, 0]), Buffer.from("a"), 10);
  assert.equal(deduper.isDuplicate(fakeImage([255, 255, 255]), Buffer.from("b"), 10), false);
});

test("isDuplicate: alternating A->B->A pattern is caught via history", () => {
  const deduper = new FrameDeduper();
  const a = () => fakeImage([50, 50, 50]);
  const b = () => fakeImage([255, 255, 255]);
  assert.equal(deduper.isDuplicate(a(), Buffer.from("a1"), 10), false);
  assert.equal(deduper.isDuplicate(b(), Buffer.from("b1"), 10), false);
  // Back to A: not a duplicate of the immediately-prior B, but matches the
  // A in history.
  assert.equal(deduper.isDuplicate(a(), Buffer.from("a2"), 10), true);
});
