// Unit tests for the FT.SEARCH reply parser. Run: deno test _shared/redis.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { parseKnnReply } from "./redis.ts";

Deno.test("parseKnnReply: extracts ids from a typical RESP2 reply", () => {
  // [count, key1, [field,val,...], key2, [field,val,...]]
  const reply = [
    2,
    "node:aaaa",
    ["id", "aaaa", "score", "0.12"],
    "node:bbbb",
    ["id", "bbbb", "score", "0.34"],
  ];
  assertEquals(parseKnnReply(reply), ["aaaa", "bbbb"]);
});

Deno.test("parseKnnReply: handles an empty result set", () => {
  assertEquals(parseKnnReply([0]), []);
});

Deno.test("parseKnnReply: ignores docs without an id field", () => {
  const reply = [1, "node:x", ["score", "0.5"]];
  assertEquals(parseKnnReply(reply), []);
});

Deno.test("parseKnnReply: tolerates non-array / null input", () => {
  assertEquals(parseKnnReply(null), []);
  assertEquals(parseKnnReply(undefined), []);
  assertEquals(parseKnnReply("oops"), []);
});

Deno.test("parseKnnReply: id field position within the field list is flexible", () => {
  const reply = [1, "node:z", ["score", "0.1", "id", "zzzz"]];
  assertEquals(parseKnnReply(reply), ["zzzz"]);
});
