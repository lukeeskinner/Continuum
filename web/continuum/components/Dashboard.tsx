"use client";

// Top-level dashboard shell: realtime graph canvas + query sidebar.
// Loads the existing graph on mount, then subscribes to the SSE event stream
// and appends nodes/edges live.
import { useCallback, useEffect, useMemo, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import QuerySidebar from "./QuerySidebar";
import NodeDetail from "./NodeDetail";
import InviteModal from "./InviteModal";
import { getClusterMembers, getGraph, type MemberProfile } from "@/lib/data";
import type { ClusterMembership } from "@/lib/data";
import type {
  ClusterEvent,
  GraphLink,
  GraphNode,
  SemanticEdge,
  SemanticNode,
} from "@/types/graph";

interface Props {
  clusterId: string;
  clusters: ClusterMembership[];
  role: "admin" | "member";
  onSelectCluster: (id: string) => void;
  onSignOut: () => void;
}

function toGraphNode(
  n: Pick<SemanticNode, "id" | "user_id" | "app" | "topic" | "concept" | "error_type"> & {
    created_at?: string | null;
  },
  nameFor: (userId: string) => string,
): GraphNode {
  return {
    id: n.id,
    label: n.concept,
    app: n.app,
    topic: n.topic,
    errorType: n.error_type,
    teammate: nameFor(n.user_id),
    createdAt: n.created_at ?? null,
    colorKey: n.user_id,
  };
}

export default function Dashboard({
  clusterId,
  clusters,
  role,
  onSelectCluster,
  onSignOut,
}: Props) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const nameFor = useCallback(
    (userId: string) => {
      const m = members.find((p) => p.id === userId);
      return m?.full_name || m?.email || userId.slice(0, 8);
    },
    [members],
  );

  // Load members + existing graph whenever the active cluster changes.
  useEffect(() => {
    let cancelled = false;
    setNodes([]);
    setLinks([]);
    setSelected(null);

    (async () => {
      try {
        const [memberList, graph] = await Promise.all([
          getClusterMembers(clusterId),
          getGraph(clusterId),
        ]);
        if (cancelled) return;
        const nameLookup = (userId: string) => {
          const m = memberList.find((p) => p.id === userId);
          return m?.full_name || m?.email || userId.slice(0, 8);
        };
        setMembers(memberList);
        setNodes(graph.nodes.map((n) => toGraphNode(n, nameLookup)));
        setLinks(
          graph.edges.map((e: SemanticEdge) => ({
            source: e.source_node_id,
            target: e.target_node_id,
            type: e.type,
          })),
        );
      } catch (err) {
        console.error("initial graph load failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  // Subscribe to realtime mutations for the active cluster.
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
          prev.some((p) => p.id === n.id) ? prev : [...prev, toGraphNode(n, nameFor)],
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
  }, [clusterId, nameFor]);

  const handleNodeClick = useCallback((node: GraphNode) => setSelected(node), []);

  const teammateCount = useMemo(
    () => new Set(nodes.map((n) => n.colorKey)).size,
    [nodes],
  );

  return (
    <div className="flex h-screen w-full bg-black text-zinc-100">
      <div className="relative flex-1">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold">Continuum</h1>
            <p className="text-xs text-zinc-500">
              {nodes.length} nodes · {links.length} connections · {teammateCount} active
            </p>
          </div>
          {clusters.length > 1 && (
            <select
              value={clusterId}
              onChange={(e) => onSelectCluster(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
          {role === "admin" && (
            <button
              onClick={() => setInviteOpen(true)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500"
            >
              Invite
            </button>
          )}
          <button
            onClick={onSignOut}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900"
          >
            Sign out
          </button>
        </div>

        <GraphCanvas nodes={nodes} links={links} onNodeClick={handleNodeClick} />

        {selected && (
          <NodeDetail node={selected} onClose={() => setSelected(null)} />
        )}
      </div>

      <QuerySidebar
        clusterId={clusterId}
        onHighlight={(ids) =>
          setSelected(nodes.find((n) => ids.includes(n.id)) ?? null)
        }
      />

      {inviteOpen && (
        <InviteModal clusterId={clusterId} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  );
}
