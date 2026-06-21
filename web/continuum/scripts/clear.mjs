// Clears all semantic nodes + edges for a cluster (keeps members/cluster).
// Service-role (bypasses RLS). Recreate data with scripts/seed.mjs.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CID = process.env.SEED_CLUSTER_ID || "a904128f-7c42-4f32-bb9a-a82fca92cf3d";

const db = createClient(URL, SR, { auth: { persistSession: false } });

async function count(table) {
  return (await db.from(table).select("*", { count: "exact", head: true }).eq("cluster_id", CID)).count;
}

async function main() {
  console.log("before — nodes:", await count("semantic_nodes"), "edges:", await count("semantic_edges"));
  await db.from("semantic_edges").delete().eq("cluster_id", CID);
  await db.from("semantic_nodes").delete().eq("cluster_id", CID);
  console.log("after  — nodes:", await count("semantic_nodes"), "edges:", await count("semantic_edges"));
  console.log("✓ cluster graph cleared");
}

main().catch((e) => {
  console.error("clear failed:", e.message || e);
  process.exit(1);
});
