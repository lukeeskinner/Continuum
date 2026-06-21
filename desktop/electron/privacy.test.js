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

test("classify: BLOCKED by focused-app bundle id", () => {
  const benign = { app: "Vault", topic: "notes", concept: "stuff" };
  assert.equal(privacy.classify(benign), "SHARED_ANON"); // no bundle ctx
  assert.equal(
    privacy.classify(benign, { bundleId: "com.1password.1password" }),
    "BLOCKED",
  );
  // Helper processes (prefix match) are blocked too.
  assert.equal(
    privacy.classify(benign, { bundleId: "com.1password.1password.helper" }),
    "BLOCKED",
  );
  // Unknown app is not blocked by bundle.
  assert.equal(
    privacy.classify(benign, { bundleId: "com.apple.Terminal" }),
    "SHARED_ANON",
  );
});

test("classify: Private Mode caps sharing at LOCAL_ONLY", () => {
  const work = { app: "VS Code", topic: "Rust", concept: "tokio" };
  assert.equal(privacy.classify(work), "SHARED_ANON");
  assert.equal(privacy.classify(work, { privateMode: true }), "LOCAL_ONLY");
});

test("classify: Private Mode never overrides BLOCKED", () => {
  // Blocked by bundle id even in private mode.
  assert.equal(
    privacy.classify({ app: "x" }, { privateMode: true, bundleId: "net.whatsapp.WhatsApp" }),
    "BLOCKED",
  );
  // Blocked by keyword even in private mode.
  assert.equal(
    privacy.classify({ concept: "chase bank login" }, { privateMode: true }),
    "BLOCKED",
  );
});

test("isBlockedBundle: case-insensitive exact + prefix match", () => {
  assert.equal(privacy.isBlockedBundle("NET.WHATSAPP.WHATSAPP"), true);
  assert.equal(privacy.isBlockedBundle("com.apple.MobileSMS"), true);
  assert.equal(privacy.isBlockedBundle("com.apple.Safari"), false);
  assert.equal(privacy.isBlockedBundle(null), false);
});
