// Desktop agent configuration, sourced from environment variables.
// Copy desktop/.env.example to desktop/.env and load it before launching.

let appVersion = "0.0.0";
try {
  appVersion = require("../package.json").version || appVersion;
} catch {
  // package.json not resolvable (unusual); keep the default.
}

module.exports = {
  // App version, surfaced as the Sentry release.
  appVersion,

  lettaApiKey: process.env.LETTA_API_KEY || "",
  lettaBaseUrl: process.env.LETTA_BASE_URL || "https://api.letta.com",
  lettaAgentId: process.env.LETTA_AGENT_ID || "",

  // Supabase (used for sign-in + identity resolution).
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",

  // Identity used to tag observations. Populated from the signed-in user's
  // profile after login; the env vars below act as a fallback for headless use.
  userId: process.env.CONTINUUM_USER_ID || "",
  clusterId: process.env.CONTINUUM_CLUSTER_ID || "",

  // Supabase Edge Functions base URL (…/functions/v1) + agent-sync shared
  // secret. Used to push SHARED_ANON observations straight into the graph.
  supabaseFunctionsUrl: process.env.SUPABASE_FUNCTIONS_URL || "",
  agentSyncSecret: process.env.AGENT_SYNC_SECRET || "",

  // Browserbase enrichment (opt-in). Comma-separated domain allowlist; an empty
  // list disables enrichment entirely.
  browserbaseDomains: (process.env.BROWSERBASE_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),

  // Extra macOS bundle ids to hard-block (merged with privacy.js defaults).
  // Comma-separated, e.g. "com.acme.banking,com.example.vault".
  blockBundles: (process.env.PRIVACY_BLOCK_BUNDLES || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),

  // Global shortcut that toggles the query (Spotlight-style) command bar.
  queryShortcut: process.env.QUERY_SHORTCUT || "CommandOrControl+Shift+Space",

  // Sentry error monitoring (optional). Disabled when SENTRY_DSN is unset.
  sentryDsn: process.env.SENTRY_DSN || "",
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT || "development",

  // Orkes Conductor workflow orchestration (optional). When configured, each
  // SHARED_ANON observation is ingested via a durable Conductor workflow that
  // orchestrates the agent-sync call; otherwise it posts to agent-sync directly.
  orkesServerUrl: process.env.ORKES_SERVER_URL || "",
  orkesKeyId: process.env.ORKES_KEY_ID || "",
  orkesKeySecret: process.env.ORKES_KEY_SECRET || "",

  // Capture tuning.
  captureIntervalMs: Number(process.env.CAPTURE_INTERVAL_MS || 4000),
  // Adaptive sampling: stretch toward idleIntervalMs once the user has been idle
  // past idlePauseSeconds; only light-poll for the user's return after
  // deepIdleSeconds (no captures / no paid vision calls while deeply idle).
  idleIntervalMs: Number(process.env.IDLE_CAPTURE_INTERVAL_MS || 16000),
  idlePauseSeconds: Number(process.env.IDLE_PAUSE_SECONDS || 30),
  deepIdleSeconds: Number(process.env.DEEP_IDLE_SECONDS || 300),
  deepIdlePollMs: Number(process.env.DEEP_IDLE_POLL_MS || 5000),
  // Exponential backoff cap after consecutive pipeline errors.
  maxBackoffMs: Number(process.env.MAX_BACKOFF_MS || 60000),
  // Perceptual-hash Hamming distance at/below which two frames count identical.
  hashThreshold: Number(process.env.HASH_HAMMING_THRESHOLD || 6),
  // Semantic dedup: skip identical descriptors within this window, but force one
  // through every semanticForceMs so long-lived contexts still refresh.
  semanticDedupWindowMs: Number(process.env.SEMANTIC_DEDUP_WINDOW_MS || 60000),
  semanticForceMs: Number(process.env.SEMANTIC_FORCE_REFRESH_MS || 120000),

  // Python sidecar.
  pythonPath: process.env.PYTHON_PATH || "python3",
  sidecarScript: process.env.SIDECAR_SCRIPT || "sidecar/sidecar.py",
};
