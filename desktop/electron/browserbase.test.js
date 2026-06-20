// Unit tests for Browserbase URL allowlisting.
// Run: node --test electron/browserbase.test.js
//
// The allowlist is read from BROWSERBASE_DOMAINS at config load time, so set it
// before requiring the modules under test.
process.env.BROWSERBASE_DOMAINS = "arxiv.org,github.com";

const { test } = require("node:test");
const assert = require("node:assert");
const { findEnrichableUrl } = require("./browserbase");

test("findEnrichableUrl: returns an allowlisted URL from the concept", () => {
  const url = findEnrichableUrl({ concept: "reading https://arxiv.org/abs/2301.00001 now" });
  assert.equal(url, "https://arxiv.org/abs/2301.00001");
});

test("findEnrichableUrl: matches subdomains of allowlisted hosts", () => {
  const url = findEnrichableUrl({ topic: "see https://www.github.com/foo/bar" });
  assert.equal(url, "https://www.github.com/foo/bar");
});

test("findEnrichableUrl: rejects non-allowlisted domains", () => {
  assert.equal(findEnrichableUrl({ concept: "https://evil.example.com/x" }), null);
});

test("findEnrichableUrl: strips trailing punctuation", () => {
  const url = findEnrichableUrl({ concept: "(see https://github.com/a/b)." });
  assert.equal(url, "https://github.com/a/b");
});

test("findEnrichableUrl: returns null when no URL is present", () => {
  assert.equal(findEnrichableUrl({ concept: "no links here", app: "VS Code" }), null);
});
