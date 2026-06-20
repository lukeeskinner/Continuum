// Server-Sent Events stream of realtime graph mutations for a cluster.
// Subscribes to the Redis `cluster:{id}:events` pub/sub channel and forwards
// each message to the browser, which animates new nodes/edges on the canvas.
//
// Usage (client): new EventSource(`/api/events?cluster_id=...`)
import { createRedisSubscriber, clusterChannel } from "@/lib/redis";

// ioredis requires the Node.js runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const clusterId = searchParams.get("cluster_id");
  if (!clusterId) {
    return new Response("cluster_id required", { status: 400 });
  }

  const encoder = new TextEncoder();
  const sub = createRedisSubscriber();
  const channel = clusterChannel(clusterId);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) =>
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));

      await sub.subscribe(channel);
      send(JSON.stringify({ event: "connected", data: { cluster_id: clusterId } }));

      sub.on("message", (_ch, message) => send(message));

      // Tear down the Redis connection when the client disconnects.
      request.signal.addEventListener("abort", () => {
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
