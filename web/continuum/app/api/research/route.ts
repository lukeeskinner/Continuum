// Web-research agent. Browses the right source for a query via Browserbase,
// adds each finding to the mesh as a Browser-sourced node (inserted as the
// signed-in user, so RLS permits it), and returns an OpenAI summary.
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { researchConfigured, chooseSource, browse, embed, summarize } from "@/lib/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!researchConfigured()) {
    return Response.json({ available: false, reason: "Browserbase/Claude not configured" });
  }

  const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Authed-as-user client: inserts run under the caller's RLS context.
  const supabase = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { query, cluster_id } = await req.json().catch(() => ({}));
  if (!query || !cluster_id) return Response.json({ error: "missing query or cluster_id" }, { status: 400 });

  const source = chooseSource(query);

  let findings;
  try {
    findings = await browse(query, source);
  } catch (e) {
    return Response.json({ available: true, error: `browse failed: ${String(e)}`, findings: [] }, { status: 502 });
  }

  // Embed + insert each finding as a Browser node (best-effort per item).
  const results: Array<{ title: string; url: string; snippet: string; node_id: string | null }> = [];
  for (const f of findings) {
    let nodeId: string | null = null;
    try {
      const host = new URL(f.url).hostname.replace(/^www\./, "");
      const embedding = await embed(`${f.title} | ${host} | ${f.text.slice(0, 2000)}`);
      const { data: node } = await supabase
        .from("semantic_nodes")
        .insert({
          user_id: userId,
          cluster_id,
          app: "Browser",
          topic: host,
          concept: f.title,
          error_type: null,
          raw_descriptor: JSON.stringify({ url: f.url, source }),
          embedding,
        })
        .select("id")
        .single();
      nodeId = node?.id ?? null;
    } catch {
      /* keep the finding even if embed/insert fails */
    }
    results.push({ title: f.title, url: f.url, snippet: f.text.slice(0, 220), node_id: nodeId });
  }

  let answer = "";
  try {
    answer = findings.length ? await summarize(query, findings) : "Nothing useful turned up on the web for this.";
  } catch (e) {
    answer = `Found ${findings.length} sources, but summarizing failed: ${String(e)}`;
  }

  return Response.json({
    available: true,
    source,
    answer,
    findings: results,
    added: results.filter((r) => r.node_id).length,
  });
}
