// Direct client for the Supabase `agent-sync` Edge Function.
//
// The desktop also posts observations to its Letta agent (see letta.js) for
// per-user memory, but Letta's autonomous archival promotion is too
// non-deterministic for a live demo. For SHARED_ANON observations we therefore
// push the structured descriptor straight to `agent-sync`, which embeds it,
// inserts a semantic node, and broadcasts it to the cluster's dashboard.
const config = require("./config");

async function pushNode(descriptor) {
  if (!config.supabaseFunctionsUrl || !config.agentSyncSecret) {
    console.warn("[sync] missing functions url or agent-sync secret; skipping push");
    return null;
  }
  if (!config.userId || !config.clusterId) {
    console.warn("[sync] missing user id or cluster id; skipping push");
    return null;
  }

  const res = await fetch(`${config.supabaseFunctionsUrl}/agent-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-continuum-secret": config.agentSyncSecret,
    },
    body: JSON.stringify({
      agent_id: config.lettaAgentId,
      user_id: config.userId,
      cluster_id: config.clusterId,
      descriptor: {
        app: descriptor.app,
        topic: descriptor.topic,
        concept: descriptor.concept,
        error_type: descriptor.error_type ?? null,
        ocr_text: descriptor.ocr_text ?? null,
      },
    }),
  });

  if (!res.ok) {
    console.error("[sync] agent-sync failed:", res.status, await res.text());
    return null;
  }
  return res.json();
}

module.exports = { pushNode };
