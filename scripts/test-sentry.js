#!/usr/bin/env node
// Send a couple of test events to Sentry to verify the DSN + wiring end-to-end.
// Reads SENTRY_DSN (+ SENTRY_ENVIRONMENT) from desktop/.env (auto-loaded) or env.
//
// Usage: node scripts/test-sentry.js
try {
  require("../desktop/electron/env").loadEnv();
} catch {
  // running outside the repo layout is fine; rely on real env vars
}

const sentry = require("../desktop/electron/sentry");

async function main() {
  if (!sentry.init()) {
    console.error(
      "[sentry] not configured. Set SENTRY_DSN in desktop/.env " +
        "(sentry.io → Project Settings → Client Keys (DSN)).",
    );
    process.exit(1);
  }

  console.log("[sentry] sending test events…");

  // Leave a breadcrumb trail, then send one info event and one error event so
  // both show up in the dashboard with context.
  sentry.addBreadcrumb("test", "agent boot");
  sentry.addBreadcrumb("capture", "SHARED_ANON: Cursor");
  sentry.captureMessage("Continuum desktop — Sentry test event", "info", {
    tags: { source: "test-sentry-script" },
  });
  sentry.captureException(
    new Error("Continuum desktop — test exception (safe to ignore)"),
    { tags: { source: "test-sentry-script" } },
  );

  // captureMessage/captureException are fire-and-forget; wait briefly so the
  // HTTP requests finish before the process exits.
  await new Promise((r) => setTimeout(r, 3000));
  console.log(
    "[sentry] OK — sent 1 message + 1 error. Open sentry.io → your project → " +
      "Issues to see the error, with breadcrumbs + release/platform tags.",
  );
}

main().catch((err) => {
  console.error("[sentry] failed:", err.message);
  process.exit(1);
});
