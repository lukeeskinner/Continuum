// Unit tests for ingestion helpers. Run: deno test _shared/ingest.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { dedupeSince, descriptorFingerprint, embedText } from "./ingest.ts";

Deno.test("descriptorFingerprint: case- and whitespace-insensitive", () => {
  const a = descriptorFingerprint({
    app: "VS Code",
    topic: "Rust  async",
    concept: "Tokio",
    error_type: null,
  });
  const b = descriptorFingerprint({
    app: "vs code",
    topic: "rust async",
    concept: "tokio",
    error_type: null,
  });
  assertEquals(a, b);
});

Deno.test("descriptorFingerprint: differs on a different concept", () => {
  const a = descriptorFingerprint({
    app: "VS Code",
    topic: "Rust",
    concept: "Tokio",
    error_type: null,
  });
  const b = descriptorFingerprint({
    app: "VS Code",
    topic: "Rust",
    concept: "Serde",
    error_type: null,
  });
  assert(a !== b);
});

Deno.test("embedText: pipe-joined, error_type appended only when present", () => {
  assertEquals(
    embedText({ app: "VS Code", topic: "Rust", concept: "Tokio", error_type: null }),
    "VS Code | Rust | Tokio",
  );
  assertEquals(
    embedText({ app: "Term", topic: "deploy", concept: "build", error_type: "TypeError" }),
    "Term | deploy | build | TypeError",
  );
});

Deno.test("dedupeSince: returns an ISO timestamp windowMinutes in the past", () => {
  const now = 1_700_000_000_000;
  assertEquals(dedupeSince(5, now), new Date(now - 5 * 60_000).toISOString());
});
