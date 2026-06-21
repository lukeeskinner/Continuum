// cluster-create — create a workspace (cluster) and make the caller its admin.
// Returns a shareable join code. Auth: Supabase JWT (verify_jwt = true); the
// user id is derived from the token, never the body.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

// 8-char human-shareable code, uppercase, no ambiguous 0/O/1/I/L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genJoinCode(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

interface Body {
  name?: string;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const name = (body.name ?? "").trim();
  if (!name) return jsonResponse({ error: "Workspace name is required." }, 400);

  const supabase = adminClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  // Create the cluster with a unique join code (retry once on the rare collision).
  let cluster: { id: string; name: string; join_code: string } | null = null;
  for (let attempt = 0; attempt < 3 && !cluster; attempt++) {
    const join_code = genJoinCode();
    const { data, error } = await supabase
      .from("clusters")
      .insert({ name, join_code })
      .select("id, name, join_code")
      .single();
    if (!error && data) {
      cluster = data;
      break;
    }
    // 23505 = unique_violation (join_code collision) → retry; else bail.
    if (error && error.code !== "23505") {
      return jsonResponse({ error: error.message }, 500);
    }
  }
  if (!cluster) return jsonResponse({ error: "Could not allocate a join code." }, 500);

  // Make the creator the admin.
  const { error: memberErr } = await supabase
    .from("cluster_members")
    .insert({ cluster_id: cluster.id, user_id: userId, role: "admin" });
  if (memberErr) {
    // Roll back the orphan cluster so a retry is clean.
    await supabase.from("clusters").delete().eq("id", cluster.id);
    return jsonResponse({ error: memberErr.message }, 500);
  }

  return jsonResponse({
    cluster_id: cluster.id,
    name: cluster.name,
    join_code: cluster.join_code,
    role: "admin",
  });
});
