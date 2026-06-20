"use client";

// Live knowledge-graph view. Seeds the D3 force graph with mock data so the
// visualization renders with zero backend, then demonstrates realtime by
// streaming new captures in (and, when enabled, via the SSE channel).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import {
  buildGraphNodes,
  buildGraphLinks,
  TEAMMATES,
  ACCENTS,
  EDGE_META,
  teammateById,
  STREAM_NODES,
  CLUSTER,
} from "@/lib/mock";
import type { ClusterEvent, EdgeType, GraphLink, GraphNode } from "@/types/graph";
import Link from "next/link";

const ENABLE_REALTIME = process.env.NEXT_PUBLIC_ENABLE_REALTIME === "true";

export default function GraphPage() {
  const [nodes, setNodes] = useState<GraphNode[]>(() => buildGraphNodes());
  const [links, setLinks] = useState<GraphLink[]>(() => buildGraphLinks());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [live, setLive] = useState(true);
  const streamIdx = useRef(0);

  const addNode = useCallback((n: GraphNode, link?: GraphLink) => {
    setNodes((prev) => (prev.some((p) => p.id === n.id) ? prev : [...prev, n]));
    if (link) {
      setLinks((prev) =>
        prev.some((p) => p.source === link.source && p.target === link.target)
          ? prev
          : [...prev, link],
      );
    }
  }, []);

  // Demo realtime: stream a queued capture in every few seconds while "live".
  const pushNextStream = useCallback(() => {
    const item = STREAM_NODES[streamIdx.current % STREAM_NODES.length];
    streamIdx.current += 1;
    const suffix = streamIdx.current > STREAM_NODES.length ? `-${streamIdx.current}` : "";
    const id = item.node.id + suffix;
    addNode(
      { id, label: item.node.concept, app: item.node.app, teammate: item.node.user, colorKey: item.node.user },
      item.link ? { source: id, target: item.link.target, type: item.link.type } : undefined,
    );
  }, [addNode]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(pushNextStream, 5500);
    return () => clearInterval(t);
  }, [live, pushNextStream]);

  // Optional: real SSE channel (only when explicitly enabled + backend up).
  useEffect(() => {
    if (!ENABLE_REALTIME) return;
    const source = new EventSource(`/api/events?cluster_id=${CLUSTER.id}`);
    source.onmessage = (e) => {
      let payload: ClusterEvent | { event: string };
      try {
        payload = JSON.parse(e.data);
      } catch {
        return;
      }
      if (payload.event === "node_added") {
        const n = (payload as Extract<ClusterEvent, { event: "node_added" }>).data;
        addNode({ id: n.id, label: n.concept, app: n.app, teammate: n.user_id, colorKey: n.user_id });
      } else if (payload.event === "edge_added") {
        const ed = (payload as Extract<ClusterEvent, { event: "edge_added" }>).data;
        setLinks((prev) => [...prev, { source: ed.source, target: ed.target, type: ed.type }]);
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [addNode]);

  const toggleTeammate = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hidden.has(n.teammate)),
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

      {/* Top-right: controls */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2.5 sm:right-6 sm:top-6">
        <div className="glass flex items-center gap-1 rounded-xl p-1">
          <button
            onClick={() => setLive((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${
              live ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            <span className={live ? "signal-dot" : "h-2 w-2 rounded-full bg-ink-faint"} />
            {live ? "Live" : "Paused"}
          </button>
          <button
            onClick={pushNextStream}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:text-ink"
          >
            + Capture
          </button>
        </div>

        {/* teammate filter */}
        <div className="glass rounded-xl px-3 py-3">
          <p className="eyebrow mb-2.5 text-right">Teammates</p>
          <div className="flex max-w-[15rem] flex-wrap justify-end gap-1.5">
            {TEAMMATES.map((t) => {
              const off = hidden.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTeammate(t.id)}
                  title={t.name}
                  className={`flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1.5 pr-2.5 text-[11px] font-medium transition ${
                    off ? "opacity-35" : ""
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: ACCENTS[t.accent] }} />
                  {t.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
                  style={{ background: ACCENTS[teammateById(selected.teammate)?.accent ?? "lavender"] }}
                />
                {teammateById(selected.teammate)?.name ?? selected.teammate}
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
                      {EDGE_META[c.type].label} · {teammateById(c.other!.teammate)?.name.split(" ")[0]}
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

            <Link href="/query" className="btn-grad mt-4 grid place-items-center py-2.5 text-[13px]">
              Ask about this
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
