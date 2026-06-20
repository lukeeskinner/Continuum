"use client";

// Overview — live pulse of the active cluster: counts, recent captures, and a
// live mesh. All data is read RLS-scoped for the signed-in member.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GraphCanvas from "@/components/GraphCanvas";
import { useCluster } from "@/components/cluster";
import { fetchNodes, fetchEdges, toGraphNodes, toGraphLinks } from "@/lib/queries";
import { accentForUser, displayName, firstName } from "@/lib/ui";
import type { SemanticNodeRow, SemanticEdgeRow } from "@/types/db";

const STEPS = [
  { n: "1", title: "Observe", body: "A local agent reads what you're working on. It never leaves your machine." },
  { n: "2", title: "Filter", body: "You decide what stays private and what becomes shareable meaning." },
  { n: "3", title: "Weave", body: "The meaning joins one shared graph, linking your work to everyone's." },
];

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OverviewPage() {
  const { active, members } = useCluster();
  const [nodeRows, setNodeRows] = useState<SemanticNodeRow[]>([]);
  const [edgeRows, setEdgeRows] = useState<SemanticEdgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([fetchNodes(active.id), fetchEdges(active.id)])
      .then(([n, e]) => {
        if (cancelled) return;
        setNodeRows(n);
        setEdgeRows(e);
      })
      .catch(() => {
        if (!cancelled) {
          setNodeRows([]);
          setEdgeRows([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [active]);

  const nameFor = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    return m ? displayName(m.profiles) : uid.slice(0, 6);
  };

  const { meshNodes, meshLinks } = useMemo(() => {
    const recentRows = nodeRows.slice(-70);
    const ids = new Set(recentRows.map((n) => n.id));
    return {
      meshNodes: toGraphNodes(recentRows),
      meshLinks: toGraphLinks(edgeRows.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id))),
    };
  }, [nodeRows, edgeRows]);

  const recent = useMemo(() => [...nodeRows].slice(-7).reverse(), [nodeRows]);
  const today = useMemo(() => {
    const d = new Date().toDateString();
    return nodeRows.filter((n) => new Date(n.created_at).toDateString() === d).length;
  }, [nodeRows]);

  const metrics = [
    { value: nodeRows.length, label: "concepts woven" },
    { value: edgeRows.length, label: "connections" },
    { value: today, label: "captured today" },
    { value: members.length, label: "members" },
  ];

  if (!active) return <NoCluster />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-9 px-5 py-8 pb-24 sm:px-8 md:pb-12">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-12">
        <div className="fade-up lg:col-span-7">
          <p className="eyebrow">On-device · privacy-first</p>
          <h1 className="font-display mt-5 text-[2.7rem] leading-[1.0] sm:text-[3.6rem]">
            Somebody already
            <br />
            <span className="italic text-brand">solved this.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-soft">
            Continuum watches how each teammate works — on their own machine — and weaves the{" "}
            <span className="font-medium text-ink">meaning</span> of it into one shared graph. When
            your problem matches someone&apos;s past, the connection surfaces on its own.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/graph" className="btn-grad px-5 py-2.5 text-[14px]">
              Open the live graph →
            </Link>
            <Link href="/query" className="card card-hover px-5 py-2.5 text-[14px] font-medium text-ink">
              Ask the mesh
            </Link>
          </div>
        </div>

        <div className="fade-up lg:col-span-5" style={{ animationDelay: "100ms" }}>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="eyebrow">cluster · {active.name}</span>
              <span className="eyebrow flex items-center gap-1.5 text-ink-soft">
                <span className="signal-dot" /> live
              </span>
            </div>
            <div
              className="relative h-[300px]"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            >
              <GraphCanvas nodes={meshNodes} links={meshLinks} />
              {!loading && meshNodes.length === 0 && (
                <div className="absolute inset-0 grid place-items-center">
                  <p className="eyebrow">no concepts captured yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Instrument metric strip */}
      <section className="card flex flex-col divide-y divide-line fade-up sm:flex-row sm:divide-x sm:divide-y-0">
        {metrics.map((m) => (
          <div key={m.label} className="flex-1 px-6 py-5">
            <p className="stat text-[2.4rem] text-ink">{m.value}</p>
            <p className="eyebrow mt-2">{m.label}</p>
          </div>
        ))}
      </section>

      {/* Recent captures + members */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card fade-up p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <p className="eyebrow">Signal · recent captures</p>
            <Link href="/graph" className="eyebrow text-brand hover:text-ink">
              open graph →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-[13px] text-ink-faint">
              No captures yet. As teammates work, their concepts will appear here.
            </p>
          ) : (
            <ol className="relative">
              <span aria-hidden className="absolute bottom-2 left-[5px] top-1 w-px bg-line" />
              {recent.map((n) => (
                <li key={n.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
                  <span
                    className="relative z-10 mt-1.5 block h-[11px] w-[11px] shrink-0 rounded-full ring-4"
                    style={{ background: accentForUser(n.user_id), color: "var(--surface)" }}
                  />
                  <div className="min-w-0 flex-1 border-b border-line/60 pb-4">
                    <p className="text-[14px] leading-snug">
                      <span className="font-medium">{firstName(nameFor(n.user_id))}</span>{" "}
                      <span className="text-ink-soft">captured “{n.concept}” in {n.app}</span>
                    </p>
                    <p className="eyebrow mt-1.5">{ago(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="card fade-up p-6">
          <p className="eyebrow mb-4">Members · {members.length}</p>
          <ul className="flex flex-col gap-3.5">
            {members.length === 0 && <p className="text-[12.5px] text-ink-faint">No members loaded.</p>}
            {members.map((m) => {
              const name = displayName(m.profiles);
              return (
                <li key={m.user_id} className="flex items-center gap-3">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-[#0b0e1a]"
                    style={{ background: accentForUser(m.user_id) }}
                  >
                    {firstName(name).slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{name}</p>
                    <p className="truncate text-[11px] text-ink-faint">{m.profiles?.email}</p>
                  </div>
                  <span className="eyebrow shrink-0">{m.role}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How the mesh forms */}
      <section className="card fade-up p-6 sm:p-8">
        <p className="eyebrow">How the mesh forms</p>
        <div className="relative mt-7 grid gap-8 sm:grid-cols-3 sm:gap-6">
          <span aria-hidden className="absolute left-[12%] right-[12%] top-[6px] hidden h-px bg-line sm:block" />
          {STEPS.map((s) => (
            <div key={s.n} className="relative">
              <span
                className="relative z-10 grid h-[13px] w-[13px] place-items-center rounded-full ring-4 ring-[var(--surface)]"
                style={{ background: "var(--brand)" }}
              />
              <p className="eyebrow mt-4">step {s.n}</p>
              <h3 className="font-display mt-1 text-2xl">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function NoCluster() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <div className="card p-7 text-center">
        <p className="eyebrow">No cluster</p>
        <h2 className="font-display mt-2 text-2xl">You&apos;re not in a workspace yet</h2>
        <p className="mt-2 text-[13px] text-ink-soft">
          Ask a manager for an invite link, or redeem one to join the mesh.
        </p>
      </div>
    </div>
  );
}
