"use client";

// Live knowledge-graph view. Reads semantic_nodes / semantic_edges for the
// active cluster (RLS-scoped) and subscribes to Supabase Realtime so new
// captures + connections animate in as they're written.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GraphCanvas from "@/components/GraphCanvas";
import { useCluster } from "@/components/cluster";
import { fetchNodes, fetchEdges, toGraphNodes, toGraphLinks } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { EDGE_META, accentForUser, displayName, firstName } from "@/lib/ui";
import type { EdgeType, GraphLink, GraphNode } from "@/types/graph";
import type { SemanticNodeRow, SemanticEdgeRow } from "@/types/db";

export default function GraphPage() {
  const { active, members } = useCluster();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [liveOn, setLiveOn] = useState(false);

  const nameFor = useCallback(
    (uid: string) => {
      const m = members.find((x) => x.user_id === uid);
      return m ? displayName(m.profiles) : uid.slice(0, 6);
    },
    [members],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([fetchNodes(active.id), fetchEdges(active.id)])
      .then(([n, e]) => {
        if (cancelled) return;
        setNodes(toGraphNodes(n));
        setLinks(toGraphLinks(e));
      })
      .catch(() => {
        if (!cancelled) {
          setNodes([]);
          setLinks([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));

    const channel = getSupabase()
      .channel(`graph:${active.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "semantic_nodes", filter: `cluster_id=eq.${active.id}` },
        (p) => {
          const n = p.new as SemanticNodeRow;
          setNodes((prev) =>
            prev.some((x) => x.id === n.id)
              ? prev
              : [...prev, { id: n.id, label: n.concept, app: n.app, teammate: n.user_id, colorKey: n.user_id }],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "semantic_edges", filter: `cluster_id=eq.${active.id}` },
        (p) => {
          const e = p.new as SemanticEdgeRow;
          setLinks((prev) =>
            prev.some((x) => x.source === e.source_node_id && x.target === e.target_node_id)
              ? prev
              : [...prev, { source: e.source_node_id, target: e.target_node_id, type: e.type }],
          );
        },
      )
      .subscribe((status) => setLiveOn(status === "SUBSCRIBED"));

    return () => {
      cancelled = true;
      getSupabase().removeChannel(channel);
    };
  }, [active]);

  const toggleTeammate = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visibleNodes = useMemo(() => nodes.filter((n) => !hidden.has(n.teammate)), [nodes, hidden]);

  const connections = useMemo(() => {
    if (!selected) return [];
    return links
      .filter((l) => l.source === selected.id || l.target === selected.id)
      .map((l) => {
        const otherId = l.source === selected.id ? l.target : l.source;
        return { type: l.type as EdgeType, other: nodes.find((n) => n.id === otherId) };
      })
      .filter((c) => c.other);
  }, [selected, links, nodes]);

  if (!active) return <NoCluster />;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: "var(--bg)",
        backgroundImage: "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <GraphCanvas nodes={visibleNodes} links={links} onNodeClick={setSelected} />

      {/* empty / loading hint */}
      {!loading && nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
          <div className="glass pointer-events-auto max-w-sm rounded-xl p-6 text-center">
            <p className="eyebrow">Nothing captured yet</p>
            <h2 className="font-display mt-2 text-xl">The mesh is empty</h2>
            <p className="mt-2 text-[13px] text-ink-soft">
              As teammates work, their agents write concepts here and they&apos;ll appear live.
            </p>
          </div>
        </div>
      )}

      {/* Top-left: identity + readout */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-[19rem] sm:left-6 sm:top-6">
        <div className="glass pointer-events-auto rounded-xl px-4 py-3.5">
          <p className="eyebrow">Live graph</p>
          <h1 className="font-display mt-1 text-xl leading-tight">{active.name}</h1>
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
            <span className="ml-auto flex items-center gap-1.5">
              <span className={liveOn ? "signal-dot" : "h-2 w-2 rounded-full bg-ink-faint"} />
              {liveOn ? "live" : "paused"}
            </span>
          </div>
        </div>
      </div>

      {/* Top-right: teammate filter */}
      {members.length > 0 && (
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <div className="glass rounded-xl px-3 py-3">
            <p className="eyebrow mb-2.5 text-right">Teammates</p>
            <div className="flex max-w-[15rem] flex-wrap justify-end gap-1.5">
              {members.map((m) => {
                const off = hidden.has(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    onClick={() => toggleTeammate(m.user_id)}
                    title={displayName(m.profiles)}
                    className={`flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1.5 pr-2.5 text-[11px] font-medium transition ${
                      off ? "opacity-35" : ""
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ background: accentForUser(m.user_id) }} />
                    {firstName(displayName(m.profiles))}
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
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accentForUser(selected.teammate) }} />
                {nameFor(selected.teammate)}
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
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: EDGE_META[c.type].color }} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px]">{c.other!.label}</p>
                    <p className="eyebrow mt-0.5">
                      {EDGE_META[c.type].label} · {firstName(nameFor(c.other!.teammate))}
                    </p>
                  </div>
                </div>
              ))}
              {connections.length === 0 && (
                <p className="text-[12.5px] text-ink-faint">No connections yet — the mesh is still forming.</p>
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

function NoCluster() {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="card max-w-sm p-7 text-center">
        <p className="eyebrow">No cluster</p>
        <h2 className="font-display mt-2 text-2xl">You&apos;re not in a workspace yet</h2>
        <p className="mt-2 text-[13px] text-ink-soft">
          Ask a manager for an invite link, or redeem one to join the mesh.
        </p>
      </div>
    </div>
  );
}
