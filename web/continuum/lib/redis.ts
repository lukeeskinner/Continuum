// Server-only Redis client (ioredis). Used for pub/sub subscription on the
// realtime SSE route. A dedicated connection is required per subscriber.
import Redis from "ioredis";
import { serverEnv } from "./env";

export function createRedisSubscriber(): Redis {
  return new Redis(serverEnv.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
  });
}

export function clusterChannel(clusterId: string): string {
  return `cluster:${clusterId}:events`;
}
