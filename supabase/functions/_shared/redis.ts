// Redis Stack helpers (node:{id} hash cache, VSS index, pub/sub, rate limit).
//
// IMPORTANT: This uses Redis Stack search commands (FT.CREATE / FT.SEARCH),
// which require a Redis Stack deployment (e.g. Redis Cloud with RediSearch).
// Upstash Redis does NOT support FT.* modules — if you deploy on Upstash, use
// the pgvector fallback (`match_nodes` RPC) instead of the KNN path here.
import { connect, type Redis } from "https://deno.land/x/redis@v0.32.3/mod.ts";
import { ENV } from "./env.ts";
import { toFloat32Buffer, EMBEDDING_DIM } from "./embeddings.ts";

let client: Redis | null = null;

export async function redisClient(): Promise<Redis> {
  if (client) return client;
  const url = new URL(ENV.REDIS_URL());
  client = await connect({
    hostname: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    tls: url.protocol === "rediss:",
  });
  return client;
}

export interface NodeRecord {
  id: string;
  userId: string;
  clusterId: string;
  descriptor: string;
}

export async function cacheNode(
  redis: Redis,
  node: NodeRecord,
  embedding: number[],
): Promise<void> {
  const buf = toFloat32Buffer(embedding);
  await redis.sendCommand("HSET", [
    `node:${node.id}`,
    "id", node.id,
    "user_id", node.userId,
    "cluster_id", node.clusterId,
    "descriptor", node.descriptor,
    "embedding", buf,
  ]);
}

export async function publishEvent(
  redis: Redis,
  clusterId: string,
  event: string,
  data: unknown,
): Promise<void> {
  await redis.publish(
    `cluster:${clusterId}:events`,
    JSON.stringify({ event, data }),
  );
}

// Sliding-window token bucket. Returns true if the request is allowed.
export async function checkRateLimit(
  redis: Redis,
  userId: string,
  limit = 50_000,
): Promise<boolean> {
  const key = `ratelimit:user:${userId}:min`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= limit;
}

// Idempotent VSS index creation. Safe to call on cold start.
export async function ensureVectorIndex(redis: Redis): Promise<void> {
  try {
    await redis.sendCommand("FT.CREATE", [
      "idx:nodes", "ON", "HASH", "PREFIX", "1", "node:",
      "SCHEMA",
      "cluster_id", "TAG",
      "embedding", "VECTOR", "FLAT", "6",
      "TYPE", "FLOAT32",
      "DIM", String(EMBEDDING_DIM),
      "DISTANCE_METRIC", "COSINE",
    ]);
  } catch (err) {
    // "Index already exists" is expected on warm starts.
    if (!String(err).includes("Index already exists")) throw err;
  }
}
