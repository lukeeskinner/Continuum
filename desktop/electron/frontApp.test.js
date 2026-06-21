const { test } = require("node:test");
const assert = require("node:assert");
const frontApp = require("./frontApp");

test("_parse: extracts bundle id + display name from lsappinfo output", () => {
  const out = frontApp._parse(
    '"CFBundleIdentifier"="com.apple.Notes"\n"LSDisplayName"="Notes"\n',
  );
  assert.deepEqual(out, { bundleId: "com.apple.Notes", name: "Notes" });
});

test("_parse: tolerates a missing field", () => {
  assert.deepEqual(frontApp._parse('"LSDisplayName"="Finder"'), {
    bundleId: null,
    name: "Finder",
  });
});

test("_parse: returns null when nothing matches", () => {
  assert.equal(frontApp._parse(""), null);
  assert.equal(frontApp._parse("garbage output"), null);
});
