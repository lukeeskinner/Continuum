// Unit tests for embedding helpers. Run: deno test _shared/embeddings.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { EMBEDDING_DIM, toFloat32Buffer } from "./embeddings.ts";

Deno.test("toFloat32Buffer: encodes little-endian float32", () => {
  const buf = toFloat32Buffer([1, 2, 3]);
  assertEquals(buf.byteLength, 12); // 3 floats * 4 bytes
  // Round-trip back through a Float32Array view.
  const view = new Float32Array(buf.buffer, buf.byteOffset, 3);
  assertEquals([...view], [1, 2, 3]);
});

Deno.test("toFloat32Buffer: handles an empty vector", () => {
  assertEquals(toFloat32Buffer([]).byteLength, 0);
});

Deno.test("EMBEDDING_DIM matches the schema (1536)", () => {
  assertEquals(EMBEDDING_DIM, 1536);
});
