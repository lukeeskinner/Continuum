// Unit tests for the .env loader. Run: node --test electron/env.test.js
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseEnv, loadEnv } = require("./env");

test("parseEnv: basic key=value pairs", () => {
  assert.deepEqual(parseEnv("A=1\nB=two"), { A: "1", B: "two" });
});

test("parseEnv: ignores blank lines and comments", () => {
  assert.deepEqual(parseEnv("# comment\n\nA=1\n  # indented\nB=2"), { A: "1", B: "2" });
});

test("parseEnv: supports leading export", () => {
  assert.deepEqual(parseEnv("export TOKEN=abc"), { TOKEN: "abc" });
});

test("parseEnv: strips surrounding quotes and keeps inline # when quoted", () => {
  assert.deepEqual(parseEnv('A="v # not a comment"'), { A: "v # not a comment" });
  assert.deepEqual(parseEnv("B='single'"), { B: "single" });
});

test("parseEnv: strips inline comment from unquoted values", () => {
  assert.deepEqual(parseEnv("A=val # trailing"), { A: "val" });
});

test("parseEnv: skips invalid keys", () => {
  assert.deepEqual(parseEnv("1BAD=x\n GOOD_KEY=y"), { GOOD_KEY: "y" });
});

test("parseEnv: handles '=' inside the value", () => {
  assert.deepEqual(parseEnv("URL=postgres://a:b=c@host"), { URL: "postgres://a:b=c@host" });
});

test("loadEnv: populates process.env without overriding existing vars", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "continuum-env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "CONTINUUM_TEST_NEW=fromfile\nCONTINUUM_TEST_EXISTING=fromfile");
  process.env.CONTINUUM_TEST_EXISTING = "fromshell";

  loadEnv(file);
  assert.equal(process.env.CONTINUUM_TEST_NEW, "fromfile");
  assert.equal(process.env.CONTINUUM_TEST_EXISTING, "fromshell"); // not overridden

  delete process.env.CONTINUUM_TEST_NEW;
  delete process.env.CONTINUUM_TEST_EXISTING;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadEnv: missing file is a no-op", () => {
  assert.deepEqual(loadEnv(path.join(os.tmpdir(), "definitely-missing-xyz.env")), {});
});
