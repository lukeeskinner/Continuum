// cluster-join — join an existing workspace (cluster) by its shareable code.
// Auth: Supabase JWT (verify_jwt = true); the user id comes from the token.
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

interface Body {
  join_code?: string;
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

  // Codes are stored/compared uppercase; tolerate spaces and case from the UI.
  const joinCode = (body.join_code ?? "").trim().toUpperCase();
  if (!joinCode) return jsonResponse({ error: "Join code is required." }, 400);

  const supabase = adminClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const { data: cluster } = await supabase
    .from("clusters")
    .select("id, name")
    .eq("join_code", joinCode)
    .maybeSingle();
  if (!cluster) return jsonResponse({ error: "Invalid join code." }, 404);

  // Already a member? Keep their existing role; otherwise add as member.
  const { data: existing } = await supabase
    .from("cluster_members")
    .select("role")
    .eq("cluster_id", cluster.id)
    .eq("user_id", userId)
    .maybeSingle();

  let role = existing?.role ?? "member";
  if (!existing) {
    const { error: insErr } = await supabase
      .from("cluster_members")
      .insert({ cluster_id: cluster.id, user_id: userId, role: "member" });
    if (insErr) return jsonResponse({ error: insErr.message }, 500);
    role = "member";
  }

  return jsonResponse({ cluster_id: cluster.id, name: cluster.name, role });
});
