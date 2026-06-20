// agent-sync — Webhook from a Letta agent when it promotes an event into
// archival memory. Embeds the descriptor, inserts a semantic node into
// Postgres + Redis, and broadcasts the new node to the cluster's clients.
//
// Auth: shared secret in the `x-continuum-secret` header (AGENT_SYNC_SECRET).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { embed } from "../_shared/embeddings.ts";
import {
  cacheNode,
  ensureVectorIndex,
  publishEvent,
  redisClient,
} from "../_shared/redis.ts";

interface Descriptor {
  app: string;
  topic: string;
  concept: string;
  error_type: string | null;
  // Locally-extracted on-screen text (tesseract.js), best-effort.
  ocr_text?: string;
}

interface AgentSyncBody {
  agent_id: string;
  user_id: string;
  cluster_id: string;
  descriptor: Descriptor;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.headers.get("x-continuum-secret") !== ENV.AGENT_SYNC_SECRET()) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: AgentSyncBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const { user_id, cluster_id, descriptor } = body;
  if (!user_id || !cluster_id || !descriptor) {
    return jsonResponse({ error: "missing fields" }, 400);
  }

  const rawDescriptor = JSON.stringify(descriptor);
  const embedText = `${descriptor.app} | ${descriptor.topic} | ${descriptor.concept}` +
    (descriptor.error_type ? ` | ${descriptor.error_type}` : "") +
    (descriptor.ocr_text ? ` | ${descriptor.ocr_text}` : "");
  const embedding = await embed(embedText);

  const supabase = adminClient();
  const { data: node, error } = await supabase
    .from("semantic_nodes")
    .insert({
      user_id,
      cluster_id,
      app: descriptor.app,
      topic: descriptor.topic,
      concept: descriptor.concept,
      error_type: descriptor.error_type,
      ocr_text: descriptor.ocr_text ?? null,
      raw_descriptor: rawDescriptor,
      embedding,
    })
    .select("id")
    .single();

  if (error || !node) {
    return jsonResponse({ error: error?.message ?? "insert failed" }, 500);
  }

  // Best-effort Redis cache + broadcast; Postgres is the source of truth.
  try {
    const redis = await redisClient();
    await ensureVectorIndex(redis);
    await cacheNode(
      redis,
      { id: node.id, userId: user_id, clusterId: cluster_id, descriptor: rawDescriptor },
      embedding,
    );
    await publishEvent(redis, cluster_id, "node_added", {
      id: node.id,
      user_id,
      cluster_id,
      ...descriptor,
    });
  } catch (err) {
    console.error("redis sync failed (non-fatal):", err);
  }

  return jsonResponse({ status: "synchronized", node_id: node.id });
});
