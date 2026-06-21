// Orkes Conductor workflow orchestration (dependency-free REST client).
//
// When configured, each SHARED_ANON observation is ingested through a durable
// Conductor workflow ("continuum_ingest") instead of a direct agent-sync POST.
// The workflow is a single HTTP system task that calls the agent-sync Edge
// Function, so Conductor handles retries/durability and the run is visible in
// the Orkes dashboard. No custom worker process required.
const config = require("./config");

const WORKFLOW_NAME = "continuum_ingest";

function base() {
  return config.orkesServerUrl.replace(/\/$/, "");
}

function isConfigured() {
  return Boolean(config.orkesServerUrl && config.orkesKeyId && config.orkesKeySecret);
}

let cachedToken = null;
let tokenExpiry = 0;

// Exchange the Orkes application key/secret for a bearer token (cached ~50 min).
async function getToken() {
  if (!config.orkesKeyId || !config.orkesKeySecret) return null;
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${base()}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyId: config.orkesKeyId, keySecret: config.orkesKeySecret }),
  });
  if (!res.ok) throw new Error(`orkes token failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  cachedToken = json.token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  return cachedToken;
}

async function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = await getToken();
  if (token) headers["X-Authorization"] = token;
  return headers;
}

// The Conductor workflow definition. Pure; exported for unit testing.
// A single HTTP task POSTs the descriptor to the agent-sync Edge Function.
function buildIngestWorkflowDef() {
  return {
    name: WORKFLOW_NAME,
    description: "Ingest a Continuum observation into the team graph via agent-sync.",
    version: 1,
    schemaVersion: 2,
    ownerEmail: "continuum@continuum.dev",
    tasks: [
      {
        name: "agent_sync_http",
        taskReferenceName: "agent_sync",
        type: "HTTP",
        inputParameters: {
          http_request: {
            uri: "${workflow.input.functionsUrl}/agent-sync",
            method: "POST",
            contentType: "application/json",
            headers: {
              "x-continuum-secret": "${workflow.input.secret}",
            },
            body: {
              agent_id: "${workflow.input.agentId}",
              user_id: "${workflow.input.userId}",
              cluster_id: "${workflow.input.clusterId}",
              descriptor: "${workflow.input.descriptor}",
            },
          },
        },
      },
    ],
    outputParameters: {
      node_id: "${agent_sync.output.response.body.node_id}",
    },
  };
}

// Build the workflow execution input from a descriptor. Pure; exported for tests.
function buildIngestInput(descriptor) {
  return {
    functionsUrl: config.supabaseFunctionsUrl,
    secret: config.agentSyncSecret,
    agentId: config.lettaAgentId,
    userId: config.userId,
    clusterId: config.clusterId,
    descriptor: {
      app: descriptor.app,
      topic: descriptor.topic,
      concept: descriptor.concept,
      error_type: descriptor.error_type ?? null,
    },
  };
}

// Upsert the workflow definition (idempotent). Call once on startup.
async function registerWorkflow() {
  const res = await fetch(`${base()}/api/metadata/workflow`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify([buildIngestWorkflowDef()]),
  });
  if (!res.ok) throw new Error(`orkes register failed: ${res.status} ${await res.text()}`);
  return true;
}

// Start a continuum_ingest workflow execution. Resolves with the workflow id.
async function startIngest(descriptor) {
  const res = await fetch(`${base()}/api/workflow/${WORKFLOW_NAME}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(buildIngestInput(descriptor)),
  });
  if (!res.ok) throw new Error(`orkes start failed: ${res.status} ${await res.text()}`);
  // The start endpoint returns the workflow id as a (sometimes quoted) string.
  return (await res.text()).replace(/^"|"$/g, "");
}

module.exports = {
  WORKFLOW_NAME,
  isConfigured,
  getToken,
  buildIngestWorkflowDef,
  buildIngestInput,
  registerWorkflow,
  startIngest,
};
