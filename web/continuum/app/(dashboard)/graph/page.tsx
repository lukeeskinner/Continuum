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
import { IconBolt, IconPlus, IconGraph } from "@/components/icons";

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
        backgroundImage:
          "radial-gradient(circle at center, rgba(157,123,255,0.10) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    >
      <GraphCanvas nodes={visibleNodes} links={links} onNodeClick={setSelected} />

      {/* Top-left: title + stats */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-xs sm:left-6 sm:top-6">
        <div className="glass pointer-events-auto rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <IconGraph width={18} height={18} className="text-lavender" />
            <h1 className="text-base font-bold tracking-tight">Live Knowledge Graph</h1>
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">
            Every node is a concept a teammate&apos;s agent observed — drawn together as you work.
          </p>
          <div className="mt-3 flex gap-2 text-xs font-semibold">
            <span className="chip bg-lavender/12 text-ink-soft">
              <b className="text-ink">{visibleNodes.length}</b>&nbsp;nodes
            </span>
            <span className="chip bg-sky/12 text-ink-soft">
              <b className="text-ink">{links.length}</b>&nbsp;edges
            </span>
            {live && (
              <span className="chip bg-mint/15 text-ink-soft">
                <span className="dot-online !h-2 !w-2" /> live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Top-right: controls */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-3 sm:right-6 sm:top-6">
        <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
          <button
            onClick={() => setLive((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              live ? "bg-mint/15 text-ink" : "text-ink-soft hover:bg-white/70"
            }`}
          >
            <span className={live ? "dot-online !h-2 !w-2" : "h-2 w-2 rounded-full bg-ink-faint"} />
            {live ? "Live" : "Paused"}
          </button>
          <span className="h-5 w-px bg-line" />
          <button
            onClick={pushNextStream}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-white/70"
          >
            <IconPlus width={14} height={14} /> Capture
          </button>
        </div>

        {/* teammate filter */}
        <div className="glass rounded-2xl px-3 py-2.5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">Teammates</p>
          <div className="flex flex-wrap justify-end gap-1.5">
            {TEAMMATES.map((t) => {
              const off = hidden.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTeammate(t.id)}
                  title={t.name}
                  className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11px] font-semibold transition ${
                    off ? "opacity-40" : ""
                  }`}
                  style={{ background: `${ACCENTS[t.accent]}1f` }}
                >
                  <span
                    className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: ACCENTS[t.accent] }}
                  >
                    {t.initials}
                  </span>
                  {t.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom-left: edge-type legend */}
      <div className="glass absolute bottom-4 left-4 rounded-2xl px-4 py-3 sm:bottom-6 sm:left-6">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
          Relationship types
        </p>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(EDGE_META) as EdgeType[]).map((k) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span
                className="h-0.5 w-6 rounded-full"
                style={{ background: EDGE_META[k].color }}
              />
              <span className="font-semibold text-ink">{EDGE_META[k].label}</span>
              <span className="text-ink-faint">{EDGE_META[k].description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Node detail drawer */}
      {selected && (
        <div className="fade-up absolute bottom-4 right-4 top-4 w-[300px] max-w-[calc(100%-2rem)] sm:bottom-6 sm:right-6 sm:top-auto sm:max-h-[60%]">
          <div className="glass flex h-full flex-col rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <span
                className="chip text-white"
                style={{ background: ACCENTS[teammateById(selected.teammate)?.accent ?? "lavender"] }}
              >
                {teammateById(selected.teammate)?.name ?? selected.teammate}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-sm text-ink-faint hover:bg-white/70 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <h3 className="mt-3 text-lg font-bold leading-tight">{selected.label}</h3>
            <p className="mt-1 text-xs text-ink-soft">
              Observed in <span className="font-semibold text-ink">{selected.app}</span>
            </p>

            <p className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              {connections.length} connections
            </p>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
              {connections.map((c, i) => (
                <div key={i} className="card flex items-center gap-2 px-2.5 py-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: EDGE_META[c.type].color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{c.other!.label}</p>
                    <p className="text-[10px] text-ink-faint">
                      {EDGE_META[c.type].label} ·{" "}
                      {teammateById(c.other!.teammate)?.name.split(" ")[0]}
                    </p>
                  </div>
                </div>
              ))}
              {connections.length === 0 && (
                <p className="text-xs text-ink-faint">No connections yet — the mesh is still forming.</p>
              )}
            </div>

            <button className="btn-grad mt-3 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold">
              <IconBolt width={15} height={15} /> Ask about this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
