// Unit tests for the capture-surface admission policy. Run: node --test desktop/electron/
const { test } = require("node:test");
const assert = require("node:assert");
const { classifyCaptureSurfacePolicy, NORMAL, URL_ONLY, SKIP_FRAME } = require("./admission");

test("classify: non-browser apps are always Normal", () => {
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Visual Studio Code", windowTitle: "search results" }),
    NORMAL,
  );
});

test("classify: missing window title is Normal", () => {
  assert.equal(classifyCaptureSurfacePolicy({ appName: "Google Chrome", windowTitle: "" }), NORMAL);
});

test("classify: generic browser pages are skipped", () => {
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Google Chrome", windowTitle: "New Tab" }),
    SKIP_FRAME,
  );
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Safari", windowTitle: "Start Page" }),
    SKIP_FRAME,
  );
});

test("classify: navigation/search surfaces are skipped", () => {
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Firefox", windowTitle: "cats - Search results" }),
    SKIP_FRAME,
  );
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Chrome", windowTitle: "Explore - Twitter" }),
    SKIP_FRAME,
  );
});

test("classify: listing surfaces are UrlOnly", () => {
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Chrome", windowTitle: "Videos - Some Channel" }),
    URL_ONLY,
  );
});

test("classify: ordinary content pages are Normal", () => {
  assert.equal(
    classifyCaptureSurfacePolicy({ appName: "Chrome", windowTitle: "How to fix a Rust lifetime error" }),
    NORMAL,
  );
});
