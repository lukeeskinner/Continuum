// One-off seeder for the Continuum schema. Uses the service-role key (bypasses
// RLS, can create auth users). Reads secrets from env — never hardcode them.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_ADMIN_EMAIL=... \
//     node scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
const CLUSTER_ID = process.env.SEED_CLUSTER_ID || "a904128f-7c42-4f32-bb9a-a82fca92cf3d";

if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

function embedding() {
  const a = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0)) || 1;
  return "[" + a.map((x) => (x / norm).toFixed(6)).join(",") + "]";
}

async function ensureUser(email, fullName) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!error && data?.user) return data.user.id;
  // Already exists — find them.
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const hit = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (!list?.users?.length || list.users.length < 200) break;
  }
  throw new Error(`could not create or find user ${email}: ${error?.message}`);
}

// ---- people ----
const TEAM = [
  { key: "luke", email: ADMIN_EMAIL || "luke@continuum.dev", name: "Luke Skinner", role: "admin" },
  { key: "maya", email: "maya.chen@continuum.dev", name: "Maya Chen", role: "member" },
  { key: "diego", email: "diego.alvarez@continuum.dev", name: "Diego Alvarez", role: "member" },
  { key: "priya", email: "priya.nair@continuum.dev", name: "Priya Nair", role: "member" },
  { key: "sam", email: "sam.okafor@continuum.dev", name: "Sam Okafor", role: "member" },
];

// ---- concepts (semantic_nodes) ----
const NODES = [
  { key: "n_mask", who: "luke", app: "Cursor", topic: "transformers", concept: "Attention mask broadcasting", src: "SCREEN" },
  { key: "n_overflow", who: "luke", app: "Terminal", topic: "numerics", concept: "Softmax overflow guard", src: "SCREEN" },
  { key: "n_kv", who: "luke", app: "Cursor", topic: "inference", concept: "KV-cache layout", src: "SCREEN" },
  { key: "n_flash", who: "maya", app: "arXiv", topic: "transformers", concept: "FlashAttention v2", src: "BROWSER" },
  { key: "n_stable", who: "maya", app: "arXiv", topic: "numerics", concept: "Numerical stability of softmax", src: "BROWSER" },
  { key: "n_online", who: "maya", app: "arXiv", topic: "numerics", concept: "Online softmax recomputation", src: "BROWSER" },
  { key: "n_rope", who: "maya", app: "Notion", topic: "transformers", concept: "RoPE positional encoding", src: "MANUAL" },
  { key: "n_rls", who: "diego", app: "VS Code", topic: "supabase", concept: "Row-level security policies", src: "SCREEN" },
  { key: "n_jwt", who: "diego", app: "VS Code", topic: "supabase", concept: "JWT claims in RLS", src: "SCREEN" },
  { key: "n_iso", who: "diego", app: "VS Code", topic: "supabase", concept: "Cluster isolation tests", src: "SCREEN" },
  { key: "n_hnsw", who: "priya", app: "Notion", topic: "vectors", concept: "pgvector HNSW tuning", src: "MANUAL" },
  { key: "n_metric", who: "priya", app: "Notion", topic: "vectors", concept: "Cosine vs inner product", src: "MANUAL" },
  { key: "n_dim", who: "priya", app: "Notion", topic: "vectors", concept: "Embedding dim 1536", src: "MANUAL" },
  { key: "n_hover", who: "sam", app: "Figma", topic: "design", concept: "Force-graph hover states", src: "SCREEN" },
  { key: "n_legend", who: "sam", app: "Figma", topic: "design", concept: "Edge-type color legend", src: "SCREEN" },
];

// ---- connections (semantic_edges) ----
const EDGES = [
  ["n_flash", "n_mask", "BUILDS_ON", 0.89, "FlashAttention v2 reformulates the masked attention Luke is editing."],
  ["n_stable", "n_overflow", "RELATED_TO", 0.86, "Both address softmax numerical overflow."],
  ["n_online", "n_stable", "BUILDS_ON", 0.91, "Online softmax is the technique behind the stability result."],
  ["n_kv", "n_flash", "RELATED_TO", 0.83, "KV-cache layout interacts with FlashAttention tiling."],
  ["n_rope", "n_flash", "RELATED_TO", 0.81, "RoPE is commonly paired with FlashAttention."],
  ["n_metric", "n_stable", "CONTRADICTS", 0.84, "Inner-product scaling note conflicts with the stability assumptions."],
  ["n_jwt", "n_rls", "BUILDS_ON", 0.9, "JWT claims extend the base RLS policy."],
  ["n_iso", "n_rls", "RELATED_TO", 0.85, "Isolation tests validate the RLS policies."],
  ["n_hnsw", "n_dim", "BUILDS_ON", 0.82, "The HNSW index is built over the 1536-dim embeddings."],
  ["n_metric", "n_dim", "RELATED_TO", 0.8, "Distance metric choice depends on embedding dimensionality."],
  ["n_legend", "n_hover", "BUILDS_ON", 0.83, "The colour legend builds on the hover-state spec."],
  ["n_iso", "n_hnsw", "RELATED_TO", 0.8, "Isolation tests exercise the vector index path."],
];

async function main() {
  console.log("→ cluster");
  await db.from("clusters").upsert({ id: CLUSTER_ID, name: "Continuum Core" });

  console.log("→ users + membership");
  const userId = {};
  for (const t of TEAM) {
    userId[t.key] = await ensureUser(t.email, t.name);
    await db.from("profiles").update({ full_name: t.name }).eq("id", userId[t.key]);
    await db
      .from("cluster_members")
      .upsert({ cluster_id: CLUSTER_ID, user_id: userId[t.key], role: t.role }, { onConflict: "cluster_id,user_id" });
    console.log(`   ${t.name} <${t.email}> ${t.role}`);
  }

  console.log("→ clearing previous seed for cluster");
  await db.from("semantic_edges").delete().eq("cluster_id", CLUSTER_ID);
  await db.from("semantic_nodes").delete().eq("cluster_id", CLUSTER_ID);

  console.log("→ nodes");
  const rows = NODES.map((n) => ({
    user_id: userId[n.who],
    cluster_id: CLUSTER_ID,
    app: n.app,
    topic: n.topic,
    concept: n.concept,
    error_type: null,
    raw_descriptor: `${n.who} working on ${n.concept} in ${n.app}`,
    embedding: embedding(),
  }));
  const { data: inserted, error: nodeErr } = await db.from("semantic_nodes").insert(rows).select("id, concept");
  if (nodeErr) throw nodeErr;
  const idByConcept = Object.fromEntries(inserted.map((r) => [r.concept, r.id]));
  const idFor = (key) => idByConcept[NODES.find((n) => n.key === key).concept];
  console.log(`   inserted ${inserted.length} nodes`);

  console.log("→ edges");
  const edgeRows = EDGES.map(([s, t, type, sim, why]) => ({
    cluster_id: CLUSTER_ID,
    source_node_id: idFor(s),
    target_node_id: idFor(t),
    type,
    similarity: sim,
    explanation: why,
  }));
  const { error: edgeErr } = await db.from("semantic_edges").insert(edgeRows);
  if (edgeErr) throw edgeErr;
  console.log(`   inserted ${edgeRows.length} edges`);

  console.log("\n✓ seed complete");
  console.log(`  cluster ${CLUSTER_ID}`);
  console.log(`  admin login: ${TEAM[0].email}`);
}

main().catch((e) => {
  console.error("seed failed:", e.message || e);
  process.exit(1);
});
