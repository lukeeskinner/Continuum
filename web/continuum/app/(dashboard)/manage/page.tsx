"use client";

// Manager dashboard: cluster + invite, per-cluster privacy policy, member role
// management, and the token spend monitor (reads Redis rate-limiter counters —
// mocked here). All controls are local state until backend wiring lands.
import { useState } from "react";
import {
  CLUSTER,
  TEAMMATES,
  ACCENTS,
  PRIVACY_POLICIES,
  type Role,
  type PrivacyPolicy,
  type Teammate,
} from "@/lib/mock";
import { IconShield, IconLink, IconUsers, IconBolt, IconPlus } from "@/components/icons";

const ROLES: Role[] = ["Manager", "Member", "Viewer"];
const JOIN_BASE = "continuum.app/join";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "" : "bg-surface-2"
      }`}
      style={on ? { background: "linear-gradient(90deg, var(--mint), var(--sky))" } : undefined}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function tokenColor(pct: number) {
  if (pct >= 0.85) return "var(--edge-contradicts)";
  if (pct >= 0.6) return "var(--peach)";
  return "var(--mint)";
}

export default function ManagePage() {
  const [policies, setPolicies] = useState<PrivacyPolicy[]>(PRIVACY_POLICIES);
  const [members, setMembers] = useState<Teammate[]>(TEAMMATES);
  const [copied, setCopied] = useState(false);

  const togglePolicy = (id: string) =>
    setPolicies((p) => p.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));

  const setRole = (id: string, role: Role) =>
    setMembers((m) => m.map((x) => (x.id === id ? { ...x, role } : x)));

  const copyInvite = () => {
    navigator.clipboard?.writeText(`https://${JOIN_BASE}/${CLUSTER.inviteCode}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const totalPerMin = members.reduce((s, m) => s + m.tokensThisMin, 0);
  const totalLimit = members.reduce((s, m) => s + m.tokenLimit, 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 pb-24 md:pb-10">
      <header className="fade-up">
        <span className="chip bg-lavender/12 text-ink-soft">
          <IconShield width={13} height={13} className="text-lavender" /> manager controls
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Manage <span className="text-gradient">{CLUSTER.name}</span>
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Privacy policy, roles, and spend for your cluster — all in one place.
        </p>
      </header>

      {/* Invite + spend summary */}
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card fade-up p-5 lg:col-span-1" style={{ animationDelay: "40ms" }}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
            <IconLink width={16} height={16} className="text-lavender" /> Invite teammates
          </h2>
          <p className="text-xs text-ink-soft">Share this link — new members redeem it to join.</p>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">
              {JOIN_BASE}/<span className="font-bold text-ink">{CLUSTER.inviteCode}</span>
            </span>
            <button
              onClick={copyInvite}
              className="btn-grad shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button className="card card-hover mt-3 flex w-full items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-ink">
            <IconPlus width={15} height={15} className="text-lavender" /> Invite by email
          </button>
        </div>

        <div className="card fade-up p-5 lg:col-span-2" style={{ animationDelay: "90ms" }}>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <IconBolt width={16} height={16} className="text-peach" /> Token spend monitor
            </h2>
            <span className="text-xs text-ink-faint">per-minute rate limiter</span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <p className="text-2xl font-extrabold">
                {(totalPerMin / 1000).toFixed(1)}k
                <span className="text-sm font-medium text-ink-faint"> / {(totalLimit / 1000).toFixed(0)}k tok/min</span>
              </p>
              <p className="text-[11px] text-ink-faint">Cluster throughput right now</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-mint">
                ${CLUSTER.monthlySpend.toFixed(2)}
                <span className="text-sm font-medium text-ink-faint"> / ${CLUSTER.monthlyBudget}</span>
              </p>
              <p className="text-[11px] text-ink-faint">Claude budget this month</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {members
              .filter((m) => m.tokensThisMin > 0)
              .map((m) => {
                const pct = m.tokensThisMin / m.tokenLimit;
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 truncate text-xs font-semibold">{m.name.split(" ")[0]}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct * 100}%`, background: tokenColor(pct) }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right font-mono text-[11px] text-ink-soft">
                      {(m.tokensThisMin / 1000).toFixed(1)}k
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Privacy policy */}
        <section className="card fade-up p-5" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
            <IconShield width={16} height={16} className="text-mint" /> Privacy policy
          </h2>
          <p className="mb-4 text-xs text-ink-soft">
            What every member&apos;s on-device agent is allowed to share with the mesh.
          </p>
          <ul className="flex flex-col gap-1">
            {policies.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-2/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-xs text-ink-faint">{p.description}</p>
                </div>
                <Toggle on={p.enabled} onClick={() => togglePolicy(p.id)} />
              </li>
            ))}
          </ul>
        </section>

        {/* Members + roles */}
        <section className="card fade-up p-5" style={{ animationDelay: "160ms" }}>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
            <IconUsers width={16} height={16} className="text-sky" /> Members · {members.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                <span className="relative shrink-0">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: ACCENTS[m.accent] }}
                  >
                    {m.initials}
                  </span>
                  {m.online && (
                    <span className="dot-online absolute -bottom-0.5 -right-0.5 ring-2 ring-white" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{m.name}</p>
                  <p className="truncate text-[11px] text-ink-faint">
                    {m.nodeCount} nodes · {m.online ? m.app : m.lastActive}
                  </p>
                </div>
                <div className="flex rounded-lg bg-surface-2 p-0.5">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(m.id, r)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        m.role === r ? "bg-white text-ink shadow-sm" : "text-ink-faint hover:text-ink-soft"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
