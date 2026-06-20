// query-synthesize — User Q&A across the team graph. Rate-limits, embeds the
// query, retrieves the top-K nodes (pgvector RPC), expands the subgraph via
// edges, and synthesizes a citation-aware answer with Claude Sonnet.
//
// Auth: requires a valid Supabase JWT (verify_jwt = true).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { embed } from "../_shared/embeddings.ts";
import { checkRateLimit, ensureVectorIndex, knnSearch, redisClient } from "../_shared/redis.ts";
import { claude, MODELS } from "../_shared/anthropic.ts";
import { recordSpan } from "../_shared/trace.ts";

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

  const startedAt = Date.now();
  const queryEmbedding = await embed(body.query);

  // Hot path: Redis Stack VSS (FT.SEARCH KNN). Falls back to the pgvector
  // `match_nodes` RPC when Redis Stack / RediSearch is unavailable (e.g. Upstash).
  let topIds: string[] = [];
  let retrieval = "vss";
  try {
    const redis = await redisClient();
    await ensureVectorIndex(redis);
    topIds = await knnSearch(redis, body.cluster_id, queryEmbedding, 20);
  } catch (err) {
    console.error("redis VSS unavailable, falling back to pgvector:", err);
    retrieval = "pgvector";
  }

  if (topIds.length === 0) {
    retrieval = "pgvector";
    const { data: topNodes, error: matchErr } = await supabase.rpc("match_nodes", {
      query_embedding: queryEmbedding,
      target_cluster: body.cluster_id,
      match_count: 20,
    });
    if (matchErr) return jsonResponse({ error: matchErr.message }, 500);
    topIds = (topNodes ?? []).map((n: { id: string }) => n.id);
  }

  if (topIds.length === 0) {
    return jsonResponse({
      answer: "Nothing relevant has been captured for this question yet.",
      subgraph: { nodes: [], edges: [] },
    });
  }

  // Expand the subgraph one hop via edges, then cap the total at 40 nodes.
  const { data: edges } = await supabase
    .from("semantic_edges")
    .select("source_node_id, target_node_id, type, explanation")
    .eq("cluster_id", body.cluster_id)
    .or(`source_node_id.in.(${topIds.join(",")}),target_node_id.in.(${topIds.join(",")})`);

  const idSet = new Set<string>(topIds);
  for (const e of edges ?? []) {
    if (idSet.size >= 40) break;
    idSet.add(e.source_node_id);
    idSet.add(e.target_node_id);
  }
  const allIds = [...idSet].slice(0, 40);

  // Fetch full rows (incl. created_at + user_id) for every node in the subgraph.
  const { data: nodeRows } = await supabase
    .from("semantic_nodes")
    .select("id, user_id, app, topic, concept, error_type, created_at")
    .in("id", allIds);

  // Resolve teammate display names for citations.
  const userIds = [...new Set((nodeRows ?? []).map((n) => n.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  const nameFor = (uid: string) => {
    const p = (profiles ?? []).find((x) => x.id === uid);
    return p?.full_name || p?.email || uid.slice(0, 8);
  };
  const hhmm = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? "??:??"
      : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const subgraphNodes = (nodeRows ?? []).map((n) => ({
    id: n.id,
    label: n.concept,
    concept: n.concept,
    app: n.app,
    topic: n.topic,
    teammate: nameFor(n.user_id),
    created_at: n.created_at,
  }));

  const context = subgraphNodes
    .map((n) =>
      `- [${n.teammate}@${
        hhmm(n.created_at)
      }] id=${n.id} concept="${n.concept}" app="${n.app}" topic="${n.topic}"`
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

  recordSpan("query-synthesize", startedAt, {
    "continuum.cluster_id": body.cluster_id,
    "continuum.query_chars": body.query.length,
    "continuum.retrieval": retrieval,
    "continuum.top_nodes": topIds.length,
    "continuum.subgraph_nodes": subgraphNodes.length,
    "continuum.subgraph_edges": (edges ?? []).length,
    "llm.model": MODELS.SONNET,
  });

  return jsonResponse({
    answer,
    subgraph: {
      nodes: subgraphNodes,
      edges: (edges ?? []).map((e) => ({
        source: e.source_node_id,
        target: e.target_node_id,
        type: e.type,
      })),
    },
  });
});
