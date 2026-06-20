"use client";

// Live knowledge-graph view. Loads the active cluster's existing graph from
// Supabase, then subscribes to the SSE event stream (/api/events) and animates
// new nodes/edges in as teammates' agents capture them.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GraphCanvas from "@/components/GraphCanvas";
import { useCluster } from "@/components/ClusterProvider";
import { getGraph } from "@/lib/data";
import { initialsFor } from "@/lib/colors";
import { EDGE_META } from "@/lib/mock";
import type {
  ClusterEvent,
  EdgeType,
  GraphLink,
  GraphNode,
  SemanticEdge,
  SemanticNode,
} from "@/types/graph";
import { IconGraph, IconBolt } from "@/components/icons";

function toGraphNode(
  n: Pick<SemanticNode, "id" | "user_id" | "app" | "topic" | "concept" | "error_type"> & {
    created_at?: string | null;
  },
): GraphNode {
  return {
    id: n.id,
    label: n.concept,
    app: n.app,
    topic: n.topic,
    errorType: n.error_type,
    teammate: n.user_id,
    createdAt: n.created_at ?? null,
    colorKey: n.user_id,
  };
}

export default function GraphPage() {
  const { activeClusterId, members, nameFor, colorFor } = useCluster();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [live, setLive] = useState(false);

  // Load the existing graph whenever the active cluster changes.
  useEffect(() => {
    if (!activeClusterId) return;
    let cancelled = false;

    (async () => {
      // Clear the previous cluster's graph before loading the new one.
      setNodes([]);
      setLinks([]);
      setSelected(null);
      setHidden(new Set());
      try {
        const graph = await getGraph(activeClusterId);
        if (cancelled) return;
        setNodes(graph.nodes.map(toGraphNode));
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
  }, [activeClusterId]);

  // Subscribe to realtime mutations for the active cluster.
  useEffect(() => {
    if (!activeClusterId) return;
    const source = new EventSource(`/api/events?cluster_id=${activeClusterId}`);
    source.onopen = () => setLive(true);
    source.onmessage = (e) => {
      let payload: ClusterEvent | { event: string };
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      if (payload.event === "connected") {
        setLive(true);
      } else if (payload.event === "node_added") {
        const n = (payload as Extract<ClusterEvent, { event: "node_added" }>).data;
        setNodes((prev) => (prev.some((p) => p.id === n.id) ? prev : [...prev, toGraphNode(n)]));
      } else if (payload.event === "edge_added") {
        const ed = (payload as Extract<ClusterEvent, { event: "edge_added" }>).data;
        setLinks((prev) =>
          prev.some((p) => p.source === ed.source && p.target === ed.target)
            ? prev
            : [...prev, { source: ed.source, target: ed.target, type: ed.type }],
        );
      }
    };
    source.onerror = () => setLive(false);
    return () => {
      source.close();
      setLive(false);
    };
  }, [activeClusterId]);

  const toggleTeammate = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hidden.has(n.colorKey)),
    [nodes, hidden],
  );

  const connections = useMemo(() => {
    if (!selected) return [];
    return links
      .filter((l) => l.source === selected.id || l.target === selected.id)
      .map((l) => {
        const otherId = l.source === selected.id ? l.target : l.source;
        const other = nodes.find((n) => n.id === otherId);
        return { type: l.type as EdgeType, other };
      })
      .filter((c) => c.other);
  }, [selected, links, nodes]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <GraphCanvas nodes={visibleNodes} links={links} onNodeClick={setSelected} />

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="glass pointer-events-auto max-w-sm rounded-2xl px-6 py-5 text-center">
            <IconGraph width={26} height={26} className="mx-auto text-lavender" />
            <p className="mt-3 text-sm font-semibold">The mesh is still forming</p>
            <p className="mt-1 text-xs text-ink-soft">
              As teammates work, their on-device agents capture concepts and they appear here live.
            </p>
          </div>
        </div>
      )}

      {/* Top-left: identity + readout */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-[19rem] sm:left-6 sm:top-6">
        <div className="glass pointer-events-auto rounded-xl px-4 py-3.5">
          <p className="eyebrow">Live graph</p>
          <h1 className="font-display mt-1 text-xl leading-tight">The team&apos;s shared mind</h1>
          <p className="mt-1.5 text-[12.5px] leading-snug text-ink-soft">
            Each node is a concept someone&apos;s agent observed. Edges are connections the mesh found.
          </p>
          <div className="tnum mt-3 flex items-center gap-3 text-[12px] text-ink-soft">
            <span>
              <span className="text-ink">{visibleNodes.length}</span> concepts
            </span>
            <span className="text-line">·</span>
            <span>
              <span className="text-ink">{links.length}</span> links
            </span>
            {live && (
              <span className="ml-auto flex items-center gap-1.5">
                <span className="signal-dot" /> live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top-right: teammate filter */}
      {members.length > 0 && (
        <div className="absolute right-4 top-4 flex flex-col items-end gap-3 sm:right-6 sm:top-6">
          <div className="glass rounded-xl px-3 py-3">
            <p className="eyebrow mb-2.5 text-right">Teammates</p>
            <div className="flex max-w-[15rem] flex-wrap justify-end gap-1.5">
              {members.map((m) => {
                const name = m.full_name || m.email;
                const off = hidden.has(m.id);
                const color = colorFor(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleTeammate(m.id)}
                    title={name}
                    className={`flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1.5 pr-2.5 text-[11px] font-medium transition ${
                      off ? "opacity-35" : ""
                    }`}
                  >
                    <span
                      className="grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold text-white"
                      style={{ background: color }}
                    >
                      {initialsFor(name)}
                    </span>
                    {name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom-left: edge-type legend */}
      <div className="glass absolute bottom-4 left-4 rounded-xl px-4 py-3.5 sm:bottom-6 sm:left-6">
        <p className="eyebrow mb-2.5">Relationships</p>
        <div className="flex flex-col gap-2">
          {(Object.keys(EDGE_META) as EdgeType[]).map((k) => (
            <div key={k} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="h-[2px] w-6 rounded-full" style={{ background: EDGE_META[k].color }} />
              <span className="text-ink">{EDGE_META[k].label}</span>
              <span className="hidden text-ink-faint sm:inline">{EDGE_META[k].description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Node detail drawer */}
      {selected && (
        <div className="fade-up absolute bottom-4 right-4 top-4 w-[300px] max-w-[calc(100%-2rem)] sm:bottom-6 sm:right-6 sm:top-auto sm:max-h-[62%]">
          <div className="glass flex h-full flex-col rounded-xl p-5">
            <div className="flex items-start justify-between gap-2">
              <span className="eyebrow flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: colorFor(selected.colorKey) }}
                />
                {nameFor(selected.colorKey)}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-sm text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            </div>
            <h3 className="font-display mt-3 text-[1.4rem] leading-tight">{selected.label}</h3>
            <p className="mt-1 text-[12.5px] text-ink-soft">
              Observed in <span className="text-ink">{selected.app}</span>
              {selected.topic ? ` · ${selected.topic}` : ""}
            </p>

            <p className="eyebrow mb-2.5 mt-5">{connections.length} connections</p>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
              {connections.map((c, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: EDGE_META[c.type].color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px]">{c.other!.label}</p>
                    <p className="eyebrow mt-0.5">
                      {EDGE_META[c.type].label} · {nameFor(c.other!.colorKey).split(" ")[0]}
                    </p>
                  </div>
                </div>
              ))}
              {connections.length === 0 && (
                <p className="text-[12.5px] text-ink-faint">
                  No connections yet — the mesh is still forming.
                </p>
              )}
            </div>

            <Link
              href="/query"
              className="btn-grad mt-4 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold"
            >
              <IconBolt width={15} height={15} /> Ask about this
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
