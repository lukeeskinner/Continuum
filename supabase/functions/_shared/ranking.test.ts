// Unit tests for hybrid ranking. Run: deno test _shared/ranking.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { fuse, recencyDecay } from "./ranking.ts";

Deno.test("fuse: single branch preserves order", () => {
  const r = fuse([{ weight: 1, ids: ["a", "b", "c"] }], { topN: 10 });
  assertEquals(r.map((h) => h.id), ["a", "b", "c"]);
});

Deno.test("fuse: a hit in both branches outranks one in a single branch", () => {
  const r = fuse([
    { weight: 0.6, ids: ["x", "y"] },
    { weight: 0.4, ids: ["x", "z"] },
  ], { topN: 10 });
  assertEquals(r[0].id, "x");
});

Deno.test("fuse: respects topN", () => {
  const r = fuse([{ weight: 1, ids: ["a", "b", "c", "d"] }], { topN: 2 });
  assertEquals(r.length, 2);
});

Deno.test("fuse: zero-weight branch is ignored", () => {
  const r = fuse([
    { weight: 0, ids: ["ignored"] },
    { weight: 1, ids: ["kept"] },
  ], { topN: 10 });
  assertEquals(r.map((h) => h.id), ["kept"]);
});

Deno.test("fuse: recency decay favors newer nodes with equal base score", () => {
  const now = 1_000_000_000_000;
  const day = 86_400_000;
  const r = fuse([
    { weight: 0.5, ids: ["old"] },
    { weight: 0.5, ids: ["new"] },
  ], {
    createdAtById: { old: now - 30 * day, new: now - 1000 },
    now,
    halfLifeHours: 72,
    decayFloor: 0.1,
    topN: 10,
  });
  assertEquals(r[0].id, "new");
});

Deno.test("fuse: relevanceFloor drops weak hits", () => {
  const r = fuse([{ weight: 1, ids: ["a", "b", "c", "d", "e"] }], {
    relevanceFloor: 0.5,
    topN: 10,
  });
  assert(r.every((h) => h.score >= 0.5));
  assert(r.length < 5);
});

Deno.test("recencyDecay: halves every half-life and respects the floor", () => {
  const now = 2_000_000_000_000;
  const h = 3_600_000;
  assertEquals(Math.round(recencyDecay(now - 72 * h, now, 72, 0) * 100), 50);
  assertEquals(recencyDecay(now - 10_000 * h, now, 72, 0.2), 0.2);
  assertEquals(recencyDecay(now, now, 72, 0.1), 1);
});
