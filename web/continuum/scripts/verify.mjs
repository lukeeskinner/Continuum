// Verifies the RLS read path the dashboard uses: sign in as the admin user
// (anon key + their JWT) and count the rows they can see in the cluster.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.SEED_ADMIN_EMAIL;
const CID = process.env.SEED_CLUSTER_ID || "a904128f-7c42-4f32-bb9a-a82fca92cf3d";
const PW = "verify-" + Math.random().toString(36).slice(2);

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function findUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  throw new Error("user not found");
}

async function main() {
  const id = await findUser(EMAIL);
  await admin.auth.admin.updateUserById(id, { password: PW });

  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signErr } = await user.auth.signInWithPassword({ email: EMAIL, password: PW });
  if (signErr) throw signErr;

  const count = async (table) =>
    (await user.from(table).select("*", { count: "exact", head: true }).eq("cluster_id", CID)).count;

  console.log("Authenticated as", EMAIL, "— rows visible under RLS:");
  console.log("  cluster_members:", await count("cluster_members"));
  console.log("  semantic_nodes :", await count("semantic_nodes"));
  console.log("  semantic_edges :", await count("semantic_edges"));

  const { data: sample } = await user
    .from("semantic_nodes")
    .select("concept, app")
    .eq("cluster_id", CID)
    .limit(3);
  console.log("  sample concepts:", (sample ?? []).map((s) => s.concept).join(" · "));
}

main().catch((e) => {
  console.error("verify failed:", e.message || e);
  process.exit(1);
});
