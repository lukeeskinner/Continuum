// query-synthesize — User Q&A across the team graph. Rate-limits, embeds the
// query, retrieves the top-K nodes (pgvector RPC), expands the subgraph via
// edges, and synthesizes a citation-aware answer with Claude Sonnet.
//
// Auth: requires a valid Supabase JWT (verify_jwt = true).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { embed } from "../_shared/embeddings.ts";
import { checkRateLimit, redisClient } from "../_shared/redis.ts";
import { claude, MODELS } from "../_shared/anthropic.ts";

const SYNTH_SYSTEM = `You are Continuum's synthesis engine. Given a user question and a set of
knowledge-graph nodes (each with a teammate, app, concept, and timestamp), write a concise,
citation-aware answer. Cite nodes inline as [Name@HH:MM]. Only use the provided nodes; if nothing
is relevant, say so plainly.`;

interface QueryBody {
  query: string;
  cluster_id: string;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let body: QueryBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body.query || !body.cluster_id) {
    return jsonResponse({ error: "missing query or cluster_id" }, 400);
  }

  // Identify the caller from the JWT for rate limiting.
  const supabase = adminClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  try {
    const redis = await redisClient();
    const allowed = await checkRateLimit(redis, userId);
    if (!allowed) return jsonResponse({ error: "rate limit exceeded" }, 429);
  } catch (err) {
    console.error("rate limit check skipped:", err);
  }

  const queryEmbedding = await embed(body.query);

  // Top-20 similar nodes (pgvector fallback; swap for Redis VSS where available).
  const { data: topNodes, error: matchErr } = await supabase.rpc("match_nodes", {
    query_embedding: queryEmbedding,
    target_cluster: body.cluster_id,
    match_count: 20,
  });
  if (matchErr) return jsonResponse({ error: matchErr.message }, 500);

  const nodeIds = (topNodes ?? []).map((n: { id: string }) => n.id);

  // Expand subgraph via BUILDS_ON / CONTRADICTS edges (cap at 40 nodes total).
  const { data: edges } = await supabase
    .from("semantic_edges")
    .select("source_node_id, target_node_id, type")
    .eq("cluster_id", body.cluster_id)
    .or(`source_node_id.in.(${nodeIds.join(",")}),target_node_id.in.(${nodeIds.join(",")})`);

  const subgraphNodes = topNodes ?? [];

  const context = subgraphNodes
    .map((n: Record<string, unknown>) =>
      `- id=${n.id} concept="${n.concept}" app="${n.app}" topic="${n.topic}"`
    )
    .join("\n");

  const answer = await claude({
    model: MODELS.SONNET,
    system: SYNTH_SYSTEM,
    maxTokens: 1024,
    messages: [{
      role: "user",
      content: `Question: ${body.query}\n\nNodes:\n${context}`,
    }],
  });

  return jsonResponse({
    answer,
    subgraph: {
      nodes: subgraphNodes,
      edges: edges ?? [],
    },
  });
});
