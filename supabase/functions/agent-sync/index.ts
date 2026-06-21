// agent-sync — Webhook from a Letta agent when it promotes an event into
// archival memory. Embeds the descriptor, inserts a semantic node into
// Postgres + Redis, and broadcasts the new node to the cluster's clients.
//
// Auth (either):
//   - Signed-in client: `Authorization: Bearer <supabase jwt>` — user_id is
//     derived from the token and cluster membership is verified server-side.
//   - Trusted webhook: shared secret in `x-continuum-secret` (AGENT_SYNC_SECRET),
//     which may set user_id in the body.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { embed, EMBEDDING_DIM } from "../_shared/embeddings.ts";
import {
  cacheNode,
  checkRateLimit,
  ensureVectorIndex,
  publishEvent,
  redisClient,
} from "../_shared/redis.ts";
import { PIPELINE } from "../_shared/pipeline_config.ts";
import { dedupeSince, type Descriptor, embedText } from "../_shared/ingest.ts";

const EMBED_MODEL = "text-embedding-3-small";

interface AgentSyncBody {
  agent_id?: string;
  // Trusted only on the shared-secret (Letta webhook) path. On the
  // authenticated client path the user is derived from the JWT, not the body.
  user_id?: string;
  cluster_id: string;
  descriptor: Descriptor;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let body: AgentSyncBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const { cluster_id, descriptor } = body;
  if (!cluster_id || !descriptor) {
    return jsonResponse({ error: "missing fields" }, 400);
  }

  const supabase = adminClient();

  // Authenticate the caller and resolve the authoritative user_id. Two paths:
  //   1. Signed-in client (desktop / web): `Authorization: Bearer <jwt>`. We
  //      derive user_id FROM the token — never the body — and verify the user
  //      belongs to the target cluster, so a client cannot write as someone
  //      else or into a cluster it is not a member of.
  //   2. Trusted server webhook (Letta agent): the shared secret, which is held
  //      only by our own infra, lets us trust body.user_id as before.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let user_id: string;
  if (jwt) {
    const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !userData?.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    user_id = userData.user.id;
    const { data: membership } = await supabase
      .from("cluster_members")
      .select("user_id")
      .eq("user_id", user_id)
      .eq("cluster_id", cluster_id)
      .maybeSingle();
    if (!membership) {
      return jsonResponse({ error: "not a member of this cluster" }, 403);
    }
  } else if (req.headers.get("x-continuum-secret") === ENV.AGENT_SYNC_SECRET()) {
    if (!body.user_id) {
      return jsonResponse({ error: "missing user_id" }, 400);
    }
    user_id = body.user_id;
  } else {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // Rate-limit BEFORE any paid work (the OpenAI embedding below). Uses the
  // shared sliding-window helper: INCR ratelimit:user:{user_id}:min, 60s TTL on
  // first write, block (429) when the count exceeds 50,000/min. Redis is
  // best-effort — if it is unreachable we log and proceed, since Postgres
  // remains the source of truth for the synced node.
  try {
    const redis = await redisClient();
    const allowed = await checkRateLimit(redis, user_id);
    if (!allowed) return jsonResponse({ error: "rate limit exceeded" }, 429);
  } catch (err) {
    console.error("rate limit check skipped:", err);
  }

  // Server-side dedup BEFORE the paid embedding call: if an identical
  // descriptor from this user landed within the window, return it unchanged.
  const since = dedupeSince(PIPELINE.ingest.dedupeWindowMinutes);
  const { data: dup } = await supabase
    .from("semantic_nodes")
    .select("id")
    .eq("user_id", user_id)
    .eq("cluster_id", cluster_id)
    .eq("app", descriptor.app)
    .eq("topic", descriptor.topic)
    .eq("concept", descriptor.concept)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (dup) {
    return jsonResponse({ status: "deduplicated", node_id: dup.id });
  }

  const rawDescriptor = JSON.stringify(descriptor);
  const text = embedText(descriptor);

  // Graceful degradation: if the embedding provider is down, store a zero
  // vector tagged embed_model='none' so the node is still keyword-searchable
  // (FNDR's "write zero vectors and continue") instead of failing the request.
  let embedding: number[];
  let embedModel = EMBED_MODEL;
  try {
    embedding = await embed(text);
  } catch (err) {
    console.error("embedding failed; storing keyword-only node:", err);
    embedding = new Array(EMBEDDING_DIM).fill(0);
    embedModel = "none";
  }

  const { data: node, error } = await supabase
    .from("semantic_nodes")
    .insert({
      user_id,
      cluster_id,
      app: descriptor.app,
      topic: descriptor.topic,
      concept: descriptor.concept,
      error_type: descriptor.error_type,
      raw_descriptor: rawDescriptor,
      embedding,
      embed_model: embedModel,
      embed_text: text,
    })
    .select("id")
    .single();

  if (error || !node) {
    return jsonResponse({ error: error?.message ?? "insert failed" }, 500);
  }

  // Best-effort Redis cache + broadcast; Postgres is the source of truth.
  try {
    const redis = await redisClient();
    // Only index real vectors in VSS; zero-vector (keyword-only) nodes are
    // served by the Postgres full-text branch instead.
    if (embedModel !== "none") {
      await ensureVectorIndex(redis);
      await cacheNode(
        redis,
        { id: node.id, userId: user_id, clusterId: cluster_id, descriptor: rawDescriptor },
        embedding,
      );
    }
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
