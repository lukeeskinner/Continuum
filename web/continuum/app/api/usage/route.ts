// Token-spend API. GET = read the per-minute token counters for a set of users
// (the same `ratelimit:user:{id}:min` keys the Edge Functions enforce); POST =
// record an estimate for the signed-in user. In production the deployed Edge
// Functions own these counters; the POST lets the dashboard reflect usage even
// before those are deployed. Best-effort: empty when Redis is absent.
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { redisConfigured, getUsage, recordUsage, TOKEN_LIMIT } from "@/lib/redis";

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
  const users = (new URL(req.url).searchParams.get("users") ?? "").split(",").filter(Boolean);
  if (!redisConfigured() || users.length === 0) {
    return Response.json({ usage: {}, limit: TOKEN_LIMIT });
  }
  try {
    return Response.json({ usage: await getUsage(users), limit: TOKEN_LIMIT });
  } catch {
    return Response.json({ usage: {}, limit: TOKEN_LIMIT });
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!redisConfigured()) return Response.json({ ok: false });
  const uid = await userIdFrom(req);
  if (!uid) return Response.json({ ok: false }, { status: 401 });
  const { tokens } = await req.json().catch(() => ({}));
  try {
    const count = await recordUsage(uid, Number(tokens) || 1);
    return Response.json({ ok: true, count });
  } catch {
    return Response.json({ ok: false });
  }
}
