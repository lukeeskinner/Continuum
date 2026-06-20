"use client";

// Top-level dashboard shell: realtime graph canvas + query sidebar.
// Subscribes to the SSE event stream and appends nodes/edges live.
import { useCallback, useEffect, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import QuerySidebar from "./QuerySidebar";
import type { ClusterEvent, GraphLink, GraphNode } from "@/types/graph";

export default function Dashboard({ clusterId }: { clusterId: string }) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);

  useEffect(() => {
    const source = new EventSource(`/api/events?cluster_id=${clusterId}`);
    source.onmessage = (e) => {
      let payload: ClusterEvent | { event: string };
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      if (payload.event === "node_added") {
        const n = (payload as Extract<ClusterEvent, { event: "node_added" }>).data;
        setNodes((prev) =>
          prev.some((p) => p.id === n.id)
            ? prev
            : [...prev, {
                id: n.id,
                label: n.concept,
                app: n.app,
                teammate: n.user_id,
                colorKey: n.user_id,
              }],
        );
      } else if (payload.event === "edge_added") {
        const ed = (payload as Extract<ClusterEvent, { event: "edge_added" }>).data;
        setLinks((prev) =>
          prev.some((p) => p.source === ed.source && p.target === ed.target)
            ? prev
            : [...prev, { source: ed.source, target: ed.target, type: ed.type }],
        );
      }
    };
    return () => source.close();
  }, [clusterId]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    // Placeholder: open a detail panel for the clicked node.
    console.log("node clicked", node);
  }, []);

  return (
    <div className="flex h-screen w-full bg-black text-zinc-100">
      <div className="relative flex-1">
        <div className="absolute left-4 top-4 z-10">
          <h1 className="text-lg font-semibold">Continuum</h1>
          <p className="text-xs text-zinc-500">
            {nodes.length} nodes · {links.length} connections
          </p>
        </div>
        <GraphCanvas nodes={nodes} links={links} onNodeClick={handleNodeClick} />
      </div>
      <QuerySidebar clusterId={clusterId} />
    </div>
  );
}
