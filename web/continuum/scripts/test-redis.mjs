// Exercises the live presence + usage routes end-to-end (signs in as the admin
// to get a real JWT, then hits the Next route handlers). Local verification.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.SEED_ADMIN_EMAIL;
const BASE = process.env.BASE_URL || "http://localhost:3000";
const CID = process.env.SEED_CLUSTER_ID || "a904128f-7c42-4f32-bb9a-a82fca92cf3d";
const PW = "redis-test-" + Math.random().toString(36).slice(2);

const admin = createClient(URL, SR, { auth: { persistSession: false } });

async function findUser(email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function main() {
  const u = await findUser(EMAIL);
  await admin.auth.admin.updateUserById(u.id, { password: PW });
  const user = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: si } = await user.auth.signInWithPassword({ email: EMAIL, password: PW });
  const token = si.session.access_token;
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const post = (path, body) => fetch(BASE + path, { method: "POST", headers: auth, body: JSON.stringify(body) }).then((r) => r.json());
  const get = (path) => fetch(BASE + path).then((r) => r.json());

  console.log("presence POST  :", await post("/api/presence", { cluster_id: CID }));
  console.log("presence GET   :", await get(`/api/presence?cluster_id=${CID}`));
  console.log("usage POST 4200:", await post("/api/usage", { tokens: 4200 }));
  console.log("usage POST 1500:", await post("/api/usage", { tokens: 1500 }));
  console.log("usage GET      :", await get(`/api/usage?users=${u.id}`));
  console.log("\n(your user id:", u.id + ")");
}

main().catch((e) => {
  console.error("test failed:", e.message || e);
  process.exit(1);
});
