"use client";

// Manager dashboard: invite teammates (real user-invite Edge Function via the
// InviteModal), the per-cluster privacy policy (local defaults until backend
// wiring lands), and member roles read from cluster_members.
import { useState } from "react";
import { useCluster } from "@/components/ClusterProvider";
import { initialsFor } from "@/lib/colors";
import InviteModal from "@/components/InviteModal";
import { PRIVACY_POLICIES, type PrivacyPolicy } from "@/lib/mock";
import { IconPlus } from "@/components/icons";

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
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 pb-24 sm:px-8 md:pb-12">
      <header className="fade-up">
        <p className="eyebrow">{isAdmin ? "manager controls" : "cluster settings"}</p>
        <h1 className="font-display mt-3 text-[2.2rem] leading-tight sm:text-4xl">
          Manage <span className="italic text-brand">{activeCluster.name}</span>
        </h1>
        <p className="mt-3 max-w-xl text-[14px] text-ink-soft">
          Invite teammates, review the privacy policy, and see who&apos;s in your cluster.
        </p>
      </header>

      {/* Invite + privacy policy */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card fade-up p-6">
          <p className="eyebrow mb-4">Invite teammates</p>
          {isAdmin ? (
            <>
              <p className="text-[13px] text-ink-soft">
                Send an invite by email — they&apos;ll get a secure link to join this cluster.
              </p>
              <button
                onClick={() => setInviteOpen(true)}
                className="btn-grad mt-4 flex w-full items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold"
              >
                <IconPlus width={15} height={15} /> Invite by email
              </button>
            </>
          ) : (
            <p className="text-[13px] text-ink-soft">
              Only cluster admins can invite new teammates. Ask an admin if you need to add someone.
            </p>
          )}
        </div>

        {/* Privacy policy */}
        <section className="card fade-up p-6 lg:col-span-2" style={{ animationDelay: "90ms" }}>
          <p className="eyebrow">Privacy policy</p>
          <p className="mb-4 mt-1.5 text-[13px] text-ink-soft">
            What every member&apos;s on-device agent is allowed to share with the mesh.
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
                <Toggle on={p.enabled} onClick={() => togglePolicy(p.id)} disabled={!isAdmin} />
              </li>
            ))}
          </ul>
        </section>
      </section>

      {/* Members + roles */}
      <section className="card fade-up p-6" style={{ animationDelay: "120ms" }}>
        <p className="eyebrow mb-4">Members · {members.length}</p>
        {members.length === 0 ? (
          <p className="text-[13px] text-ink-faint">Loading members…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => {
              const name = m.full_name || m.email;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line p-3"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                    style={{ background: colorFor(m.id) }}
                  >
                    {initialsFor(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{name}</p>
                    <p className="truncate text-[11px] text-ink-faint">{m.email}</p>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize ${
                      m.role === "admin"
                        ? "bg-lavender/15 text-ink ring-1 ring-lavender/30"
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
