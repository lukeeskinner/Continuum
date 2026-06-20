// Unit tests for the privacy/PII filter. Run: node --test desktop/electron/
const { test } = require("node:test");
const assert = require("node:assert");
const privacy = require("./privacy");

test("classify: BLOCKED for sensitive financial/auth content", () => {
  assert.equal(privacy.classify({ app: "Chrome", concept: "chase bank login" }), "BLOCKED");
  assert.equal(privacy.classify({ app: "1Password", concept: "password vault" }), "BLOCKED");
  assert.equal(
    privacy.classify({ app: "Messages", concept: "imessage with mom" }),
    "BLOCKED",
  );
});

test("classify: LOCAL_ONLY for personal-but-not-blocked content", () => {
  assert.equal(
    privacy.classify({ app: "Mail", concept: "reviewing my offer letter salary" }),
    "LOCAL_ONLY",
  );
});

test("classify: SHARED_ANON for ordinary work content", () => {
  assert.equal(
    privacy.classify({ app: "VS Code", topic: "Rust", concept: "lifetime mismatch" }),
    "SHARED_ANON",
  );
});

test("classify: BLOCKED takes precedence over LOCAL_ONLY", () => {
  // Contains both "personal" (LOCAL_ONLY) and "password" (BLOCKED) -> BLOCKED.
  assert.equal(
    privacy.classify({ concept: "personal password manager" }),
    "BLOCKED",
  );
});

test("scrub: strips home dirs, emails, and long tokens", () => {
  const out = privacy.scrub({
    app: "Terminal",
    topic: "deploy",
    concept: "ran /Users/alice/project with token opaqueTokenABCDEFGHIJKLMNOPQRST0123456789",
    error_type: null,
  });
  assert.ok(out.concept.includes("~"), "home dir replaced");
  assert.ok(!out.concept.includes("/Users/alice"), "username removed");
  assert.ok(out.concept.includes("<token>"), "long token redacted");
});

test("scrub: redacts email addresses", () => {
  const out = privacy.scrub({ concept: "emailed bob@example.com about the bug" });
  assert.ok(out.concept.includes("<email>"));
  assert.ok(!out.concept.includes("bob@example.com"));
});

test("scrub: leaves non-string fields untouched", () => {
  const out = privacy.scrub({ app: "X", error_type: null, concept: "fine" });
  assert.equal(out.error_type, null);
  assert.equal(out.concept, "fine");
});
