// Dependency-free Sentry error reporting for the desktop agent.
//
// Rather than pull the full @sentry/electron SDK into the app, we parse the DSN
// and POST a minimal event to Sentry's store endpoint (same hand-rolled
// approach as the Phoenix OTLP tracer in the edge functions). Reporting is a
// complete no-op when SENTRY_DSN is unset.
const crypto = require("crypto");
const config = require("./config");

// Parse a Sentry DSN (https://<publicKey>@<host>/<projectId>) into the pieces
// needed to authenticate and address the ingestion endpoint. Pure; exported
// for unit testing. Returns null for a malformed/empty DSN.
function parseDsn(dsn) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!u.username || !projectId) return null;
    return {
      publicKey: u.username,
      host: u.host,
      projectId,
      storeUrl: `${u.protocol}//${u.host}/api/${projectId}/store/`,
    };
  } catch {
    return null;
  }
}

// Build a minimal Sentry event payload from an error. Pure; exported for tests.
function buildEvent(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: context.level || "error",
    logger: "continuum-desktop",
    environment: context.environment || config.sentryEnvironment,
    tags: context.tags || {},
    extra: { ...(context.extra || {}), stack: err.stack || null },
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: err.message || String(err),
        },
      ],
    },
  };
}

let dsn = null;

function init() {
  dsn = parseDsn(config.sentryDsn);
  if (dsn) console.log("[sentry] error reporting enabled");
  return Boolean(dsn);
}

function isEnabled() {
  return Boolean(dsn);
}

// Send an error to Sentry. Fire-and-forget; never throws (a monitoring failure
// must not take down the agent).
function captureException(error, context = {}) {
  if (!dsn) return;
  try {
    const event = buildEvent(error, context);
    const auth =
      `Sentry sentry_version=7, sentry_client=continuum-desktop/1.0, ` +
      `sentry_key=${dsn.publicKey}`;
    fetch(dsn.storeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": auth },
      body: JSON.stringify(event),
    }).catch((e) => console.error("[sentry] send failed:", e.message));
  } catch (e) {
    console.error("[sentry] capture failed:", e.message);
  }
}

module.exports = { parseDsn, buildEvent, init, isEnabled, captureException };
