// Server-only Redis client (ioredis) + helpers for the dashboard's live
// presence and token-spend features. All helpers are best-effort: with no
// REDIS_URL configured they no-op so the app degrades gracefully.
import Redis from "ioredis";
import { serverEnv } from "./env";

// Matches the per-minute token budget enforced in the Edge Functions.
export const TOKEN_LIMIT = 50_000;
const ONLINE_WINDOW_MS = 30_000;

export function redisConfigured(): boolean {
  return Boolean(serverEnv.redisUrl);
}

let shared: Redis | null = null;
function getRedis(): Redis {
  if (shared) return shared;
  shared = new Redis(serverEnv.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
  shared.on("error", () => {}); // don't crash the route on a transient Redis blip
  return shared;
}

// ---- pub/sub (existing SSE route) ----
export function createRedisSubscriber(): Redis {
  return new Redis(serverEnv.redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });
}
export function clusterChannel(clusterId: string): string {
  return `cluster:${clusterId}:events`;
}

// ---- presence ----
const presenceKey = (clusterId: string) => `presence:cluster:${clusterId}`;

export async function heartbeat(clusterId: string, userId: string): Promise<void> {
  const r = getRedis();
  const now = Date.now();
  await r.zadd(presenceKey(clusterId), now, userId);
  // prune anyone who hasn't pinged within the window
  await r.zremrangebyscore(presenceKey(clusterId), 0, now - ONLINE_WINDOW_MS);
}

export async function getOnline(clusterId: string): Promise<string[]> {
  const r = getRedis();
  const now = Date.now();
  return r.zrangebyscore(presenceKey(clusterId), now - ONLINE_WINDOW_MS, "+inf");
}

// ---- token usage (per-user, per-minute sliding window) ----
const usageKey = (userId: string) => `ratelimit:user:${userId}:min`;

export async function getUsage(userIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (userIds.length === 0) return out;
  const r = getRedis();
  const vals = await r.mget(userIds.map(usageKey));
  userIds.forEach((id, i) => (out[id] = Number(vals[i] ?? 0)));
  return out;
}

export async function recordUsage(userId: string, tokens: number): Promise<number> {
  const r = getRedis();
  const key = usageKey(userId);
  const n = await r.incrby(key, Math.max(1, Math.floor(tokens)));
  if (n === Math.max(1, Math.floor(tokens))) await r.expire(key, 60);
  return n;
}
