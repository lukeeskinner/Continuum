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

const ROLES: Role[] = ["Manager", "Member", "Viewer"];
const JOIN_BASE = "continuum.app/join";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "" : "bg-surface-2"}`}
      style={on ? { background: "var(--mint)" } : undefined}
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
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 pb-24 sm:px-8 md:pb-12">
      <header className="fade-up">
        <p className="eyebrow">Manager controls</p>
        <h1 className="font-display mt-3 text-[2.2rem] leading-tight sm:text-4xl">
          Manage <span className="italic text-brand">{CLUSTER.name}</span>
        </h1>
        <p className="mt-3 max-w-xl text-[14px] text-ink-soft">
          Set what the mesh is allowed to see, who can do what, and keep an eye on spend.
        </p>
      </header>

      {/* Invite + spend summary */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card fade-up p-6">
          <p className="eyebrow mb-4">Invite teammates</p>
          <p className="text-[13px] text-ink-soft">Share this link — new members redeem it to join.</p>
          <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 p-2.5">
            <span className="tnum min-w-0 flex-1 truncate text-[12px] text-ink-soft">
              {JOIN_BASE}/<span className="text-ink">{CLUSTER.inviteCode}</span>
            </span>
            <button onClick={copyInvite} className="btn-grad shrink-0 px-3 py-1.5 text-[12px]">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button className="card card-hover mt-3 w-full py-2.5 text-[13px] font-medium text-ink">
            + Invite by email
          </button>
        </div>

        <div className="card fade-up p-6 lg:col-span-2" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between">
            <p className="eyebrow">Token spend monitor</p>
            <span className="eyebrow">per-minute rate limiter</span>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <p className="stat text-[2rem] text-ink">
                {(totalPerMin / 1000).toFixed(1)}k
                <span className="tnum ml-1 align-middle text-[12px] text-ink-faint">
                  / {(totalLimit / 1000).toFixed(0)}k tok·min
                </span>
              </p>
              <p className="eyebrow mt-1.5">throughput now</p>
            </div>
            <div>
              <p className="stat text-[2rem]" style={{ color: "var(--mint)" }}>
                ${CLUSTER.monthlySpend.toFixed(2)}
                <span className="tnum ml-1 align-middle text-[12px] text-ink-faint">
                  / ${CLUSTER.monthlyBudget}
                </span>
              </p>
              <p className="eyebrow mt-1.5">Claude budget</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            {members
              .filter((m) => m.tokensThisMin > 0)
              .map((m) => {
                const pct = m.tokensThisMin / m.tokenLimit;
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 truncate text-[12px] text-ink-soft">
                      {m.name.split(" ")[0]}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct * 100}%`, background: tokenColor(pct) }}
                      />
                    </div>
                    <span className="tnum w-16 shrink-0 text-right text-[11px] text-ink-soft">
                      {(m.tokensThisMin / 1000).toFixed(1)}k
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Privacy policy */}
        <section className="card fade-up p-6" style={{ animationDelay: "90ms" }}>
          <p className="eyebrow">Privacy policy</p>
          <p className="mb-4 mt-1.5 text-[13px] text-ink-soft">
            What every member&apos;s on-device agent may share with the mesh.
          </p>
          <ul className="flex flex-col">
            {policies.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 border-b border-line/60 py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{p.label}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-faint">{p.description}</p>
                </div>
                <Toggle on={p.enabled} onClick={() => togglePolicy(p.id)} />
              </li>
            ))}
          </ul>
        </section>

        {/* Members + roles */}
        <section className="card fade-up p-6" style={{ animationDelay: "120ms" }}>
          <p className="eyebrow mb-4">Members · {members.length}</p>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line p-3"
              >
                <span className="relative shrink-0">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-semibold text-[#0b0e1a]"
                    style={{ background: ACCENTS[m.accent] }}
                  >
                    {m.initials}
                  </span>
                  {m.online && (
                    <span className="dot-online absolute -bottom-0.5 -right-0.5 ring-2 ring-[#121626]" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{m.name}</p>
                  <p className="truncate text-[11px] text-ink-faint">
                    {m.nodeCount} concepts · {m.online ? m.app : m.lastActive}
                  </p>
                </div>
                <div className="flex rounded-lg bg-surface-2 p-0.5">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(m.id, r)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                        m.role === r
                          ? "bg-lavender/15 text-ink ring-1 ring-lavender/30"
                          : "text-ink-faint hover:text-ink-soft"
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
