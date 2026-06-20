"use client";

// Manager dashboard: invite teammates (real user-invite Edge Function via the
// InviteModal), the per-cluster privacy policy (local defaults until backend
// wiring lands), and member roles read from cluster_members.
import { useState } from "react";
import { useCluster } from "@/components/ClusterProvider";
import { initialsFor } from "@/lib/colors";
import InviteModal from "@/components/InviteModal";
import { PRIVACY_POLICIES, type PrivacyPolicy } from "@/lib/mock";
import { IconShield, IconLink, IconUsers, IconPlus } from "@/components/icons";

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
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

export default function ManagePage() {
  const { activeCluster, activeClusterId, role, members, colorFor } = useCluster();
  const isAdmin = role === "admin";
  const [policies, setPolicies] = useState<PrivacyPolicy[]>(PRIVACY_POLICIES);
  const [inviteOpen, setInviteOpen] = useState(false);

  const togglePolicy = (id: string) =>
    setPolicies((p) => p.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 pb-24 md:pb-10">
      <header className="fade-up">
        <span className="chip bg-lavender/12 text-ink-soft">
          <IconShield width={13} height={13} className="text-lavender" />{" "}
          {isAdmin ? "manager controls" : "cluster settings"}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Manage <span className="text-gradient">{activeCluster.name}</span>
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Invite teammates, review the privacy policy, and see who&apos;s in your cluster.
        </p>
      </header>

      {/* Invite */}
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card fade-up p-5 lg:col-span-1" style={{ animationDelay: "40ms" }}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
            <IconLink width={16} height={16} className="text-lavender" /> Invite teammates
          </h2>
          {isAdmin ? (
            <>
              <p className="text-xs text-ink-soft">
                Send an invite by email — they&apos;ll get a secure link to join this cluster.
              </p>
              <button
                onClick={() => setInviteOpen(true)}
                className="btn-grad mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold"
              >
                <IconPlus width={15} height={15} /> Invite by email
              </button>
            </>
          ) : (
            <p className="text-xs text-ink-soft">
              Only cluster admins can invite new teammates. Ask an admin if you need to add someone.
            </p>
          )}
        </div>

        {/* Privacy policy */}
        <section className="card fade-up p-5 lg:col-span-2" style={{ animationDelay: "90ms" }}>
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
                <Toggle on={p.enabled} onClick={() => togglePolicy(p.id)} disabled={!isAdmin} />
              </li>
            ))}
          </ul>
        </section>
      </section>

      {/* Members + roles */}
      <section className="card fade-up mt-5 p-5" style={{ animationDelay: "120ms" }}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
          <IconUsers width={16} height={16} className="text-sky" /> Members · {members.length}
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-ink-faint">Loading members…</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => {
              const name = m.full_name || m.email;
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: colorFor(m.id) }}
                  >
                    {initialsFor(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{name}</p>
                    <p className="truncate text-[11px] text-ink-faint">{m.email}</p>
                  </div>
                  <span
                    className={`chip shrink-0 text-[11px] font-semibold capitalize ${
                      m.role === "admin"
                        ? "bg-lavender/15 text-ink"
                        : "bg-surface-2 text-ink-soft"
                    }`}
                  >
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inviteOpen && (
        <InviteModal clusterId={activeClusterId} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  );
}
