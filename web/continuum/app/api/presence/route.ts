// Presence API. POST = heartbeat the signed-in user into the cluster's online
// set; GET = list who's online. Browser can't reach Redis directly, so this
// server route bridges it. Best-effort: returns empty when Redis is absent.
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { redisConfigured, heartbeat, getOnline } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function userIdFrom(req: Request): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!jwt) return null;
  const sb = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  const { data } = await sb.auth.getUser(jwt);
  return data.user?.id ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const clusterId = new URL(req.url).searchParams.get("cluster_id");
  if (!clusterId || !redisConfigured()) return Response.json({ online: [] });
  try {
    return Response.json({ online: await getOnline(clusterId) });
  } catch {
    return Response.json({ online: [] });
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!redisConfigured()) return Response.json({ ok: false, online: [] });
  const uid = await userIdFrom(req);
  if (!uid) return Response.json({ ok: false }, { status: 401 });
  const { cluster_id } = await req.json().catch(() => ({}));
  if (!cluster_id) return Response.json({ ok: false }, { status: 400 });
  try {
    await heartbeat(cluster_id, uid);
    return Response.json({ ok: true, online: await getOnline(cluster_id) });
  } catch {
    return Response.json({ ok: false, online: [] });
  }
}
