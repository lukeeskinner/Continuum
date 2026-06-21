#!/usr/bin/env node
// Register the Continuum ingest workflow in Orkes Conductor and verify
// connectivity. Reads ORKES_SERVER_URL / ORKES_KEY_ID / ORKES_KEY_SECRET from
// desktop/.env (auto-loaded) or the environment.
//
// Usage: node scripts/register-orkes-workflow.js
try {
  require("../desktop/electron/env").loadEnv();
} catch {
  // running outside the repo layout is fine; rely on real env vars
}

const orkes = require("../desktop/electron/orkes");

async function main() {
  if (!orkes.isConfigured()) {
    console.error(
      "[orkes] not configured. Set ORKES_SERVER_URL, ORKES_KEY_ID, and " +
        "ORKES_KEY_SECRET in desktop/.env (keys from the Orkes dashboard).",
    );
    process.exit(1);
  }

  console.log(`[orkes] registering workflow "${orkes.WORKFLOW_NAME}"…`);
  await orkes.registerWorkflow();
  console.log(
    `[orkes] OK — "${orkes.WORKFLOW_NAME}" is registered. ` +
      "Open the Orkes dashboard → Workflows to see it, and Executions once the " +
      "desktop agent ingests an observation.",
  );
}

main().catch((err) => {
  console.error("[orkes] failed:", err.message);
  process.exit(1);
});
