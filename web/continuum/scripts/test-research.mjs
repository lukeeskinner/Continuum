// End-to-end test of the web-research agent route.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.SEED_ADMIN_EMAIL;
const BASE = process.env.BASE_URL || "http://localhost:3000";
const CID = process.env.SEED_CLUSTER_ID || "a904128f-7c42-4f32-bb9a-a82fca92cf3d";
const QUERY = process.env.Q || "why is our softmax overflowing on long sequences";
const PW = "research-test-" + Math.random().toString(36).slice(2);

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function main() {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const u = list.users.find((x) => x.email?.toLowerCase() === EMAIL.toLowerCase());
  await admin.auth.admin.updateUserById(u.id, { password: PW });

  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: si } = await user.auth.signInWithPassword({ email: EMAIL, password: PW });
  const token = si.session.access_token;

  const before = (await user.from("semantic_nodes").select("*", { count: "exact", head: true }).eq("cluster_id", CID)).count;
  console.log("nodes before:", before);
  console.log("asking:", JSON.stringify(QUERY));

  const t0 = Date.now();
  const res = await fetch(BASE + "/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: QUERY, cluster_id: CID }),
  });
  const json = await res.json();
  console.log(`\n--- /api/research (${((Date.now() - t0) / 1000).toFixed(1)}s, HTTP ${res.status}) ---`);
  console.log("available:", json.available, "| source:", json.source, "| added:", json.added);
  if (json.error) console.log("error:", json.error);
  console.log("answer:", (json.answer || "").slice(0, 600));
  for (const f of json.findings || []) {
    console.log(`  - [${f.node_id ? "in mesh" : "—"}] ${f.title}\n    ${f.url}`);
  }

  const after = (await user.from("semantic_nodes").select("*", { count: "exact", head: true }).eq("cluster_id", CID)).count;
  console.log("\nnodes after:", after, `(+${after - before})`);
}

main().catch((e) => {
  console.error("test failed:", e.message || e);
  process.exit(1);
});
