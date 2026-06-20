// connection-detect — Cron-triggered (every 5 min) discovery of cross-person
// relationships. Finds high-similarity node pairs across different teammates,
// classifies each pair with Claude Haiku, and persists semantic edges.
//
// Auth: shared secret in the `Authorization: Bearer <CRON_SECRET>` header.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { claude, MODELS } from "../_shared/anthropic.ts";
import { publishEvent, redisClient } from "../_shared/redis.ts";

const SIMILARITY_THRESHOLD = 0.82;

const CLASSIFY_SYSTEM = `You classify the relationship between two knowledge-graph nodes captured from two different teammates' screens.
Respond with ONLY one JSON object: {"type": "RELATED_TO" | "CONTRADICTS" | "BUILDS_ON", "explanation": string}.
- RELATED_TO: similar concepts from different apps or times.
- CONTRADICTS: conflicting metrics, codes, or state.
- BUILDS_ON: the second node advances/refactors/builds on the first.`;

interface Candidate {
  source_id: string;
  target_id: string;
  source_concept: string;
  target_concept: string;
  similarity: number;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${ENV.CRON_SECRET()}`) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabase = adminClient();

  // Iterate clusters; for each, pull cross-person candidate pairs via pgvector.
  const { data: clusters, error: clusterErr } = await supabase
    .from("clusters")
    .select("id");
  if (clusterErr) return jsonResponse({ error: clusterErr.message }, 500);

  let edgesCreated = 0;
  const redis = await redisClient().catch(() => null);

  for (const { id: clusterId } of clusters ?? []) {
    const { data: candidates, error: candErr } = await supabase.rpc(
      "find_connection_candidates",
      { target_cluster: clusterId, threshold: SIMILARITY_THRESHOLD, max_pairs: 50 },
    );
    if (candErr) {
      console.error("candidate query failed:", candErr.message);
      continue;
    }

    for (const c of (candidates ?? []) as Candidate[]) {
      let type = "RELATED_TO";
      let explanation = "Semantically similar work across teammates.";
      try {
        const raw = await claude({
          model: MODELS.HAIKU,
          system: CLASSIFY_SYSTEM,
          maxTokens: 256,
          messages: [{
            role: "user",
            content: `Node A: ${c.source_concept}\nNode B: ${c.target_concept}`,
          }],
        });
        const parsed = JSON.parse(raw);
        type = parsed.type ?? type;
        explanation = parsed.explanation ?? explanation;
      } catch (err) {
        console.error("classification failed, defaulting RELATED_TO:", err);
      }

      const { data: edge, error: edgeErr } = await supabase
        .from("semantic_edges")
        .insert({
          cluster_id: clusterId,
          source_node_id: c.source_id,
          target_node_id: c.target_id,
          type,
          explanation,
          similarity: c.similarity,
        })
        .select("id")
        .single();

      if (edgeErr) {
        // Unique violation => edge already exists; skip.
        continue;
      }

      edgesCreated++;
      if (redis) {
        await publishEvent(redis, clusterId, "edge_added", {
          id: edge.id,
          source: c.source_id,
          target: c.target_id,
          type,
        }).catch(() => {});
      }
    }
  }

  return jsonResponse({ status: "completed", edges_created: edgesCreated });
});
