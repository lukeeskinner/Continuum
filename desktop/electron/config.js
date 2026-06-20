// Desktop agent configuration, sourced from environment variables.
// Copy desktop/.env.example to desktop/.env and load it before launching.

module.exports = {
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

  // Capture tuning.
  captureIntervalMs: Number(process.env.CAPTURE_INTERVAL_MS || 4000),
  // Mean per-pixel delta (0-255) above which a frame is considered "changed".
  frameDeltaThreshold: Number(process.env.FRAME_DELTA_THRESHOLD || 6),

  // Python sidecar.
  pythonPath: process.env.PYTHON_PATH || "python3",
  sidecarScript: process.env.SIDECAR_SCRIPT || "sidecar/sidecar.py",
};
