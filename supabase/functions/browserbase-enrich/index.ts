// browserbase-enrich — Fetch a URL's full text, embed it, and add it to the
// shared graph as a BROWSER-sourced node. Used to ground the graph in external
// reading (arXiv papers, GitHub READMEs, docs).
//
// Auth: shared secret in the `x-continuum-secret` header (AGENT_SYNC_SECRET) —
// same credential the desktop agent uses for agent-sync.
//
// Fetch strategy: this Deno Edge runtime can't drive a full headless browser
// (Browserbase is consumed via Playwright/CDP), so we fetch the page directly
// and strip HTML to readable text. This is sufficient for the doc's stated
// targets — arXiv pages, GitHub READMEs, docs — which are server-rendered. For
// JS-heavy pages, run the Browserbase CDP path from the desktop (Node) process
// and POST the extracted text here instead of a URL.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { embed } from "../_shared/embeddings.ts";
import { cacheNode, ensureVectorIndex, publishEvent, redisClient } from "../_shared/redis.ts";

interface EnrichBody {
  url: string;
  user_id: string;
  cluster_id: string;
}

// Strip tags/scripts/styles and collapse whitespace into readable text.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]).slice(0, 200) : null;
}

// Fetch raw HTML server-side.
async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ContinuumBot/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return await res.text();
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.headers.get("x-continuum-secret") !== ENV.AGENT_SYNC_SECRET()) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: EnrichBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  const { url, user_id, cluster_id } = body;
  if (!url || !user_id || !cluster_id) {
    return jsonResponse({ error: "missing fields" }, 400);
  }
  try {
    new URL(url);
  } catch {
    return jsonResponse({ error: "invalid url" }, 400);
  }

  let html: string;
  try {
    html = await fetchPage(url);
  } catch (err) {
    return jsonResponse({ error: `fetch failed: ${err}` }, 502);
  }

  const title = extractTitle(html) ?? new URL(url).hostname;
  const text = htmlToText(html).slice(0, 8000);
  if (!text) return jsonResponse({ error: "no extractable text" }, 422);

  const host = new URL(url).hostname;
  const descriptor = {
    app: "Browser",
    topic: host,
    concept: title,
    error_type: null,
    url,
    source_type: "BROWSER",
  };

  const embedText = `${title} | ${host} | ${text.slice(0, 2000)}`;
  const embedding = await embed(embedText);

  const supabase = adminClient();
  const { data: node, error } = await supabase
    .from("semantic_nodes")
    .insert({
      user_id,
      cluster_id,
      app: "Browser",
      topic: host,
      concept: title,
      error_type: null,
      raw_descriptor: JSON.stringify(descriptor),
      source_type: "BROWSER",
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
      { id: node.id, userId: user_id, clusterId: cluster_id, descriptor: JSON.stringify(descriptor) },
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

  return jsonResponse({ status: "enriched", node_id: node.id, title });
});
