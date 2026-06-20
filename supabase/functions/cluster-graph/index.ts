// cluster-graph — Returns the full node + edge set for a cluster so the web app
// can render the D3 force graph on page load.
//
// Request:  GET /cluster-graph?cluster_id=<uuid>
// Response: { nodes: [...], edges: [...] }
//
// Auth: requires a valid Supabase JWT (verify_jwt = true). Reads via the
// service-role client. The `embedding` column (1536 floats/node) is omitted —
// it is not needed to draw the graph and is far too large to ship to the browser.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

// A GET that carries an Authorization header triggers a CORS preflight, so the
// OPTIONS response must advertise GET (the shared headers only list POST).
const graphCors = { ...corsHeaders, "Access-Control-Allow-Methods": "GET, OPTIONS" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: graphCors });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const clusterId = new URL(req.url).searchParams.get("cluster_id");
  if (!clusterId) {
    return jsonResponse({ error: "missing cluster_id" }, 400);
  }

  const supabase = adminClient();

  const { data: nodes, error: nodesErr } = await supabase
    .from("semantic_nodes")
    .select(
      "id, user_id, cluster_id, app, topic, concept, error_type, raw_descriptor, created_at",
    )
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: true });
  if (nodesErr) return jsonResponse({ error: nodesErr.message }, 500);

  const { data: edges, error: edgesErr } = await supabase
    .from("semantic_edges")
    .select(
      "id, cluster_id, source_node_id, target_node_id, type, explanation, similarity, created_at",
    )
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: true });
  if (edgesErr) return jsonResponse({ error: edgesErr.message }, 500);

  return jsonResponse({ nodes: nodes ?? [], edges: edges ?? [] });
});
