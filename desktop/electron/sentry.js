// Dependency-free Sentry error reporting for the desktop agent.
//
// Rather than pull the full @sentry/electron SDK into the app, we parse the DSN
// and POST a minimal event to Sentry's store endpoint (same hand-rolled
// approach as the Phoenix OTLP tracer in the edge functions). Reporting is a
// complete no-op when SENTRY_DSN is unset.
const crypto = require("crypto");
const os = require("os");
const config = require("./config");

// Recent actions, attached to every event for far richer debugging context
// (you see the trail of what happened right before an error).
const MAX_BREADCRUMBS = 25;
const breadcrumbs = [];

function addBreadcrumb(category, message, data = {}) {
  breadcrumbs.push({
    type: "default",
    category,
    message: String(message),
    level: "info",
    timestamp: Date.now() / 1000,
    data,
  });
  while (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

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

// Shared envelope for every event: id, release, environment, platform tags, and
// the current breadcrumb trail. Pure; exported for tests.
function baseEvent(level, context = {}) {
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level,
    logger: "continuum-desktop",
    release: `continuum-desktop@${config.appVersion}`,
    environment: context.environment || config.sentryEnvironment,
    server_name: os.hostname(),
    tags: {
      platform: process.platform,
      arch: process.arch,
      component: "desktop-agent",
      ...(context.tags || {}),
    },
    extra: { ...(context.extra || {}) },
    breadcrumbs: { values: breadcrumbs.slice(-MAX_BREADCRUMBS) },
  };
}

// Build a Sentry exception event from an error. Pure; exported for tests.
function buildEvent(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const event = baseEvent(context.level || "error", context);
  event.extra.stack = err.stack || null;
  event.exception = {
    values: [{ type: err.name || "Error", value: err.message || String(err) }],
  };
  return event;
}

// Build an informational/message event (activity, not a crash). Exported for tests.
function buildMessageEvent(message, level = "info", context = {}) {
  const event = baseEvent(level, context);
  event.message = { formatted: String(message) };
  return event;
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

// POST an event to Sentry. Fire-and-forget; never throws (a monitoring failure
// must not take down the agent).
function send(event) {
  if (!dsn) return;
  try {
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

// Report an error to Sentry.
function captureException(error, context = {}) {
  if (!dsn) return;
  send(buildEvent(error, context));
}

// Report an informational/activity event (e.g. "agent started").
function captureMessage(message, level = "info", context = {}) {
  if (!dsn) return;
  send(buildMessageEvent(message, level, context));
}

module.exports = {
  parseDsn,
  baseEvent,
  buildEvent,
  buildMessageEvent,
  addBreadcrumb,
  init,
  isEnabled,
  captureException,
  captureMessage,
};
