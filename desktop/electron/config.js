// Desktop agent configuration, sourced from environment variables.
// Copy desktop/.env.example to desktop/.env and load it before launching.

module.exports = {
  lettaApiKey: process.env.LETTA_API_KEY || "",
  lettaBaseUrl: process.env.LETTA_BASE_URL || "https://api.letta.com",
  lettaAgentId: process.env.LETTA_AGENT_ID || "",

  // Identity used to tag observations.
  userId: process.env.CONTINUUM_USER_ID || "",
  clusterId: process.env.CONTINUUM_CLUSTER_ID || "",

  // Capture tuning.
  captureIntervalMs: Number(process.env.CAPTURE_INTERVAL_MS || 4000),
  // Mean per-pixel delta (0-255) above which a frame is considered "changed".
  frameDeltaThreshold: Number(process.env.FRAME_DELTA_THRESHOLD || 6),

  // Python sidecar.
  pythonPath: process.env.PYTHON_PATH || "python3",
  sidecarScript: process.env.SIDECAR_SCRIPT || "sidecar/sidecar.py",
};
