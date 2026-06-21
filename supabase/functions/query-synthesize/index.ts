// query-synthesize — User Q&A across the team graph. Rate-limits, embeds the
// query, retrieves candidates from TWO branches in parallel (vector KNN +
// Postgres full-text keyword), fuses them with recency-decay reranking, expands
// the subgraph via edges, and synthesizes a citation-aware answer with Claude.
//
// Auth: requires a valid Supabase JWT (verify_jwt = true).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";
import { embed } from "../_shared/embeddings.ts";
import { checkRateLimit, ensureVectorIndex, knnSearch, redisClient } from "../_shared/redis.ts";
import { claude, MODELS } from "../_shared/anthropic.ts";
import { recordSpan } from "../_shared/trace.ts";
import { PIPELINE } from "../_shared/pipeline_config.ts";
import { fuse } from "../_shared/ranking.ts";

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
  const R = PIPELINE.retrieval;
  // Query embedding is best-effort: if the embedding provider is unavailable
  // (or nodes were stored keyword-only with zero vectors), fall back to
  // keyword-only retrieval instead of failing the whole query.
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embed(body.query);
  } catch (err) {
    console.error("query embedding failed; using keyword-only retrieval:", err);
  }

  // ── Branch 1 (vector): Redis VSS hot path, else pgvector match_nodes. ──────
  let vectorRetrieval = "vss";
  const vectorBranch = async (): Promise<string[]> => {
    if (!queryEmbedding) return [];
    try {
      const redis = await redisClient();
      await ensureVectorIndex(redis);
      const ids = await knnSearch(redis, body.cluster_id, queryEmbedding, R.candidatesPerBranch);
      if (ids.length) return ids;
    } catch (err) {
      console.error("redis VSS unavailable, falling back to pgvector:", err);
    }
    vectorRetrieval = "pgvector";
    const { data, error } = await supabase.rpc("match_nodes", {
      query_embedding: queryEmbedding,
      target_cluster: body.cluster_id,
      match_count: R.candidatesPerBranch,
    });
    if (error) {
      console.error("match_nodes failed:", error.message);
      return [];
    }
    return (data ?? []).map((n: { id: string }) => n.id);
  };

  // ── Branch 2 (keyword): Postgres full-text. ───────────────────────────────
  const keywordBranch = async (): Promise<string[]> => {
    const { data, error } = await supabase.rpc("keyword_match_nodes", {
      query_text: body.query,
      target_cluster: body.cluster_id,
      match_count: R.candidatesPerBranch,
    });
    if (error) {
      console.error("keyword_match_nodes failed:", error.message);
      return [];
    }
    return (data ?? []).map((n: { id: string }) => n.id);
  };

  const [vectorIds, keywordIds] = await Promise.all([vectorBranch(), keywordBranch()]);
  let candidateIds = [...new Set([...vectorIds, ...keywordIds])];

  // Recency fallback: a broad question ("what have I worked on?") yields no
  // keyword hits (websearch_to_tsquery ANDs terms) and no vector hits without
  // embeddings. Rather than give up, seed Claude with the cluster's most recent
  // observations so it can still summarize recent activity.
  if (candidateIds.length === 0) {
    const { data: recent } = await supabase
      .from("semantic_nodes")
      .select("id")
      .eq("cluster_id", body.cluster_id)
      .order("created_at", { ascending: false })
      .limit(R.candidatesPerBranch);
    candidateIds = (recent ?? []).map((n: { id: string }) => n.id);
  }

  if (candidateIds.length === 0) {
    return jsonResponse({
      answer: "Nothing relevant has been captured for this question yet.",
      subgraph: { nodes: [], edges: [] },
    });
  }

  // Recency-decay needs created_at for every candidate (VSS returns ids only).
  const { data: candMeta } = await supabase
    .from("semantic_nodes")
    .select("id, created_at")
    .in("id", candidateIds);
  const createdAtById: Record<string, number> = {};
  for (const r of candMeta ?? []) {
    createdAtById[r.id] = new Date(r.created_at).getTime();
  }

  // Hybrid fusion + recency decay + rerank → seed nodes.
  const seeds = fuse(
    [
      { weight: R.vectorWeight, ids: vectorIds },
      { weight: R.keywordWeight, ids: keywordIds },
    ],
    {
      createdAtById,
      halfLifeHours: R.halfLifeHours,
      decayFloor: R.decayFloor,
      relevanceFloor: R.relevanceFloor,
      topN: R.topK,
    },
  );
  const topIds = seeds.length ? seeds.map((s) => s.id) : candidateIds.slice(0, R.topK);

  // Expand the subgraph one hop via edges, then cap the total.
  const { data: edges } = await supabase
    .from("semantic_edges")
    .select("source_node_id, target_node_id, type, explanation")
    .eq("cluster_id", body.cluster_id)
    .or(`source_node_id.in.(${topIds.join(",")}),target_node_id.in.(${topIds.join(",")})`);

  const idSet = new Set<string>(topIds);
  for (const e of edges ?? []) {
    if (idSet.size >= R.subgraphMax) break;
    idSet.add(e.source_node_id);
    idSet.add(e.target_node_id);
  }
  const allIds = [...idSet].slice(0, R.subgraphMax);

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

  // Order the synthesizer context by fused rank so the strongest hits lead.
  const rankOf = new Map(topIds.map((id, i) => [id, i]));
  const subgraphNodes = (nodeRows ?? [])
    .map((n) => ({
      id: n.id,
      label: n.concept,
      concept: n.concept,
      app: n.app,
      topic: n.topic,
      teammate: nameFor(n.user_id),
      created_at: n.created_at,
    }))
    .sort((a, b) => (rankOf.get(a.id) ?? 999) - (rankOf.get(b.id) ?? 999));

  const context = subgraphNodes
    .map((n) =>
      `- [${n.teammate}@${
        hhmm(n.created_at)
      }] id=${n.id} concept="${n.concept}" app="${n.app}" topic="${n.topic}"`
    )
    .join("\n");

  // Synthesis is best-effort: if the LLM provider is unavailable (bad key,
  // network), still return the retrieved subgraph with a plain summary instead
  // of failing the whole request, so the UI degrades gracefully.
  let answer: string;
  try {
    answer = await claude({
      model: MODELS.SONNET,
      system: SYNTH_SYSTEM,
      maxTokens: 1024,
      messages: [{
        role: "user",
        content: `Question: ${body.query}\n\nNodes:\n${context}`,
      }],
    });
  } catch (err) {
    console.error("synthesis failed; returning retrieved context:", err);
    const top = subgraphNodes
      .slice(0, 5)
      .map((n) => `• [${n.teammate}] ${n.app} — ${n.concept}`)
      .join("\n");
    answer =
      `Found ${subgraphNodes.length} relevant item(s), but answer synthesis is ` +
      `currently unavailable (LLM provider error). Most relevant:\n${top}`;
  }

  recordSpan("query-synthesize", startedAt, {
    "continuum.cluster_id": body.cluster_id,
    "continuum.query_chars": body.query.length,
    "continuum.retrieval": `hybrid(${vectorRetrieval}+keyword)`,
    "continuum.vector_hits": vectorIds.length,
    "continuum.keyword_hits": keywordIds.length,
    "continuum.seed_nodes": topIds.length,
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
