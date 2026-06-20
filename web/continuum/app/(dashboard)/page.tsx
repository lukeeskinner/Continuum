"use client";

// Overview / home: the story + a live snapshot of the active cluster's mesh.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCluster } from "@/components/ClusterProvider";
import { getGraphCounts } from "@/lib/data";
import { initialsFor } from "@/lib/colors";
import {
  IconGraph,
  IconChat,
  IconArrow,
  IconLink,
  IconUsers,
  IconShield,
  IconSpark,
} from "@/components/icons";

function StatCard({
  label,
  value,
  accent,
  Icon,
  delay,
}: {
  label: string;
  value: string | number;
  accent: string;
  Icon: (p: { width?: number; height?: number; className?: string }) => React.ReactNode;
  delay: number;
}) {
  return (
    <div className="card card-hover fade-up p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <Icon width={18} height={18} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
    </div>
  );
}

export default function OverviewPage() {
  const { activeCluster, activeClusterId, members, colorFor } = useCluster();
  const [counts, setCounts] = useState<{ nodes: number; edges: number } | null>(null);

  useEffect(() => {
    if (!activeClusterId) return;
    let cancelled = false;
    (async () => {
      setCounts(null);
      try {
        const c = await getGraphCounts(activeClusterId);
        if (!cancelled) setCounts(c);
      } catch (err) {
        console.error("failed to load graph counts:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClusterId]);

  const dash = (v: number | undefined) => (v === undefined ? "—" : v);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 pb-24 md:pb-10">
      {/* Hero */}
      <section className="card fade-up relative overflow-hidden p-7 sm:p-9">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--pink), transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 right-24 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--sky), transparent 65%)" }}
        />
        <span className="chip bg-lavender/12 text-ink-soft">
          <IconSpark width={13} height={13} className="text-lavender" /> on-device · privacy-first
        </span>
        <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Just work.<br />
          <span className="text-gradient">The mesh builds itself.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft sm:text-base">
          Every teammate runs a lightweight on-device agent. It quietly turns what you&apos;re working
          on into meaning — never screenshots — and weaves it into one shared knowledge graph. No
          uploads, no pipelines. Surprising connections just surface.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/graph" className="btn-grad flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            <IconGraph width={17} height={17} /> Open live graph
          </Link>
          <Link
            href="/query"
            className="card card-hover flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <IconChat width={17} height={17} className="text-lavender" /> Ask the mesh
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-5 grid grid-cols-3 gap-4">
        <StatCard label="Concepts in graph" value={dash(counts?.nodes)} accent="#9d7bff" Icon={IconGraph} delay={40} />
        <StatCard label="Connections" value={dash(counts?.edges)} accent="#34d6b0" Icon={IconLink} delay={90} />
        <StatCard label="Teammates" value={members.length} accent="#59c2ff" Icon={IconUsers} delay={140} />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Team */}
        <section className="card fade-up p-5 lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <IconUsers width={16} height={16} className="text-sky" /> {activeCluster.name} · team
            </h2>
            <Link href="/manage" className="flex items-center gap-1 text-xs font-semibold text-lavender hover:underline">
              Manage <IconArrow width={13} height={13} />
            </Link>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-ink-faint">Loading teammates…</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {members.map((m) => {
                const name = m.full_name || m.email;
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line/70 p-3">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: colorFor(m.id) }}
                    >
                      {initialsFor(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="truncate text-[11px] capitalize text-ink-faint">{m.role}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* How it works */}
        <section className="card fade-up flex flex-col gap-4 p-5" style={{ animationDelay: "160ms" }}>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
            <IconShield width={16} height={16} className="text-mint" /> How it works
          </h2>
          {[
            { Icon: IconSpark, accent: "#ff7eb6", title: "Observe", body: "A local agent reads what you're working on — fully on-device." },
            { Icon: IconShield, accent: "#9d7bff", title: "Filter", body: "A privacy filter decides what stays local vs. shared as meaning." },
            { Icon: IconGraph, accent: "#59c2ff", title: "Mesh", body: "Semantic embeddings weave into one shared, living team graph." },
          ].map((s) => (
            <div key={s.title} className="flex items-start gap-3">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ background: `${s.accent}1f`, color: s.accent }}
              >
                <s.Icon width={17} height={17} />
              </span>
              <div>
                <p className="text-sm font-bold">{s.title}</p>
                <p className="text-xs leading-5 text-ink-soft">{s.body}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
