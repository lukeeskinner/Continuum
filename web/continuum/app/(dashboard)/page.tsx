"use client";

// Overview — the thesis of the product, told editorially, over a live snapshot
// of the active cluster's mesh. All metrics + the signal timeline are real
// (Supabase); only the hero mesh visual is decorative.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCluster } from "@/components/ClusterProvider";
import { getGraphCounts, getGraph } from "@/lib/data";
import type { SemanticNode } from "@/types/graph";
import HeroMesh from "@/components/HeroMesh";

const STEPS = [
  { n: "1", title: "Observe", body: "A local agent reads what you're working on. It never leaves your machine." },
  { n: "2", title: "Filter", body: "You decide what stays private and what becomes shareable meaning." },
  { n: "3", title: "Weave", body: "The meaning joins one shared graph, linking your work to everyone's." },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function OverviewPage() {
  const { activeCluster, activeClusterId, members, nameFor, colorFor, initialsForUser } =
    useCluster();
  const [counts, setCounts] = useState<{ nodes: number; edges: number } | null>(null);
  const [recent, setRecent] = useState<SemanticNode[] | null>(null);

  useEffect(() => {
    if (!activeClusterId) return;
    let cancelled = false;
    setCounts(null);
    setRecent(null);
    (async () => {
      try {
        const [c, graph] = await Promise.all([
          getGraphCounts(activeClusterId),
          getGraph(activeClusterId),
        ]);
        if (cancelled) return;
        setCounts(c);
        const sorted = [...graph.nodes].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        setRecent(sorted);
      } catch (err) {
        console.error("failed to load overview data:", err);
        if (!cancelled) setRecent([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClusterId]);

  const dash = (v: number | undefined) => (v === undefined ? "—" : v);
  const capturedToday = recent?.filter((n) => isToday(n.created_at)).length;

  const METRICS = [
    { value: dash(counts?.nodes), label: "concepts woven" },
    { value: dash(counts?.edges), label: "connections" },
    { value: capturedToday === undefined ? "—" : capturedToday, label: "captured today" },
    { value: members.length, label: "teammates" },
  ];

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
            your problem matches someone&apos;s past, the connection surfaces on its own. No asking,
            no searching.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/graph" className="btn-grad px-5 py-2.5 text-[14px]">
              Open the live graph →
            </Link>
            <Link
              href="/query"
              className="card card-hover px-5 py-2.5 text-[14px] font-medium text-ink"
            >
              Ask the mesh
            </Link>
          </div>
        </div>

        <div className="fade-up lg:col-span-5" style={{ animationDelay: "100ms" }}>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="eyebrow">cluster · {activeCluster.name}</span>
              <span className="eyebrow flex items-center gap-1.5 text-ink-soft">
                <span className="signal-dot" /> weaving
              </span>
            </div>
            <div
              className="h-[300px]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            >
              <HeroMesh />
            </div>
          </div>
        </div>
      </section>

      {/* Instrument metric strip */}
      <section className="card flex flex-col divide-y divide-line fade-up sm:flex-row sm:divide-x sm:divide-y-0">
        {METRICS.map((m) => (
          <div key={m.label} className="flex-1 px-6 py-5">
            <p className="stat text-[2.4rem] text-ink">{m.value}</p>
            <p className="eyebrow mt-2">{m.label}</p>
          </div>
        ))}
      </section>

      {/* Signal timeline + side column */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card fade-up p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <p className="eyebrow">Signal · recent captures</p>
            <Link href="/graph" className="eyebrow text-brand hover:text-ink">
              open graph →
            </Link>
          </div>
          {recent === null ? (
            <p className="text-sm text-ink-faint">Loading recent activity…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No captures yet. Run the desktop agent to start weaving the mesh.
            </p>
          ) : (
            <ol className="relative">
              <span aria-hidden className="absolute bottom-2 left-[5px] top-1 w-px bg-line" />
              {recent.slice(0, 7).map((n) => {
                const name = nameFor(n.user_id);
                return (
                  <li key={n.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
                    <span
                      className="relative z-10 mt-1.5 block h-[11px] w-[11px] shrink-0 rounded-full ring-4"
                      style={{ background: colorFor(n.user_id), color: "var(--surface)" }}
                    />
                    <div className="min-w-0 flex-1 border-b border-line/60 pb-4">
                      <p className="text-[14px] leading-snug">
                        <span className="font-medium">{name.split(" ")[0]}</span>{" "}
                        <span className="text-ink-soft">
                          captured “{n.concept || n.topic}”{n.app ? ` in ${n.app}` : ""}
                        </span>
                      </p>
                      <p className="eyebrow mt-1.5">{relativeTime(n.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="card fade-up p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Team · {activeCluster.name}</p>
            <Link href="/manage" className="eyebrow text-brand hover:text-ink">
              manage
            </Link>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-ink-faint">Loading teammates…</p>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {members.map((m) => {
                const name = m.full_name || m.email;
                return (
                  <li key={m.id} className="flex items-center gap-3">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-[#0b0e1a]"
                      style={{ background: colorFor(m.id) }}
                    >
                      {initialsForUser(m.id)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{name}</p>
                      <p className="truncate text-[11px] capitalize text-ink-faint">{m.role}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* How the mesh forms — a real sequence, threaded */}
      <section className="card fade-up p-6 sm:p-8">
        <p className="eyebrow">How the mesh forms</p>
        <div className="relative mt-7 grid gap-8 sm:grid-cols-3 sm:gap-6">
          <span
            aria-hidden
            className="absolute left-[12%] right-[12%] top-[6px] hidden h-px bg-line sm:block"
          />
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
