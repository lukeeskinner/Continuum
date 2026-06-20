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
  // Perceptual-hash distance (0-64, 8x8 aHash) above which two frames are
  // considered different. Below this, plus a small RGB-distance check, a
  // frame is dropped as a duplicate (see dedupe.js).
  hashDistanceThreshold: Number(process.env.HASH_DISTANCE_THRESHOLD || 10),
  // Local OCR (tesseract.js) text extraction merged into each descriptor.
  ocrEnabled: process.env.OCR_ENABLED !== "false",

  // Python sidecar.
  pythonPath: process.env.PYTHON_PATH || "python3",
  sidecarScript: process.env.SIDECAR_SCRIPT || "sidecar/sidecar.py",
};
