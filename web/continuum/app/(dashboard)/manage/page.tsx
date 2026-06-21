"use client";

// Manager dashboard: cluster roster + invites. Invites are created through the
// `user-invite` Edge Function (admin-only, enforced server-side + by RLS);
// members/roles are read live from cluster_members + profiles.
import { useEffect, useState } from "react";
import { useCluster } from "@/components/cluster";
import { fetchInvites } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { accentForUser, displayName, initials } from "@/lib/ui";
import type { InviteRow } from "@/types/db";

const STATUS_COLOR: Record<InviteRow["status"], string> = {
  pending: "var(--peach)",
  accepted: "var(--mint)",
  revoked: "var(--ink-faint)",
};

function tokenColor(pct: number): string {
  if (pct >= 0.85) return "var(--edge-contradicts)";
  if (pct >= 0.6) return "var(--peach)";
  return "var(--mint)";
}

export default function ManagePage() {
  const { active, members } = useCluster();
  const isAdmin = active?.role === "admin";

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [limit, setLimit] = useState(50_000);

  useEffect(() => {
    if (!active) return;
    fetchInvites(active.id)
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [active]);

  // Live token-spend: poll the Redis-backed per-minute counters for members.
  useEffect(() => {
    if (members.length === 0) return;
    let stop = false;
    const ids = members.map((m) => m.user_id).join(",");
    const tick = async () => {
      try {
        const j = await (await fetch(`/api/usage?users=${ids}`)).json();
        if (stop) return;
        setUsage(j.usage ?? {});
        if (j.limit) setLimit(j.limit);
      } catch {
        /* best-effort */
      }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [members]);

  async function sendInvite() {
    if (!email.trim() || !active) return;
    setBusy(true);
    setNotice(null);
    const { error } = await getSupabase().functions.invoke("user-invite", {
      body: { email: email.trim(), cluster_id: active.id },
    });
    setBusy(false);
    if (error) {
      setNotice(error.message || "Couldn't send invite.");
      return;
    }
    setEmail("");
    setNotice(`Invited ${email.trim()}.`);
    fetchInvites(active.id).then(setInvites).catch(() => {});
  }

  const totalTokens = Object.values(usage).reduce((s, n) => s + n, 0);

  function copyLink(token: string) {
    const url = `${window.location.origin}/onboard?token=${token}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(token);
    setTimeout(() => setCopied(null), 1600);
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="card p-7 text-center">
          <p className="eyebrow">No cluster</p>
          <h2 className="font-display mt-2 text-2xl">Nothing to manage yet</h2>
          <p className="mt-2 text-[13px] text-ink-soft">Join a workspace to manage members and invites.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 pb-24 sm:px-8 md:pb-12">
      <header className="fade-up">
        <p className="eyebrow">Manager controls</p>
        <h1 className="font-display mt-3 text-[2.2rem] leading-tight sm:text-4xl">
          Manage <span className="italic text-brand">{active.name}</span>
        </h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          {isAdmin
            ? "Invite teammates and review who's in the workspace."
            : "Review who's in the workspace. Inviting requires an admin role."}
        </p>
      </header>

      {/* Live token spend (Redis per-minute counters) */}
      <section className="card fade-up p-6">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Token spend · live</p>
          <span className="eyebrow">per-minute rate limiter</span>
        </div>
        <p className="stat mt-3 text-[2rem] text-ink">
          {(totalTokens / 1000).toFixed(1)}k
          <span className="tnum ml-1 align-middle text-[12px] text-ink-faint">
            / {((limit * Math.max(members.length, 1)) / 1000).toFixed(0)}k tok·min budget
          </span>
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {members.map((m) => {
            const used = usage[m.user_id] ?? 0;
            const pct = Math.min(1, used / limit);
            return (
              <div key={m.user_id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate text-[12px] text-ink-soft">
                  {displayName(m.profiles).split(" ")[0]}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct * 100}%`, background: tokenColor(pct) }}
                  />
                </div>
                <span className="tnum w-16 shrink-0 text-right text-[11px] text-ink-soft">
                  {(used / 1000).toFixed(1)}k
                </span>
              </div>
            );
          })}
        </div>
        {totalTokens === 0 && (
          <p className="mt-3 text-[12px] text-ink-faint">
            No tokens spent in the last minute. Ask the mesh to see this move.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Invites */}
        <section className="card fade-up p-6">
          <p className="eyebrow mb-4">Invite teammates</p>
          {isAdmin ? (
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                placeholder="teammate@team.com"
                className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
              />
              <button onClick={sendInvite} disabled={busy || !email.trim()} className="btn-grad shrink-0 px-4 text-[13px] disabled:opacity-40">
                {busy ? "Sending…" : "Invite"}
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">Only admins can invite new members.</p>
          )}
          {notice && <p className="mt-2.5 text-[12.5px] text-ink-soft">{notice}</p>}

          <div className="mt-5 flex flex-col gap-2">
            {invites.length === 0 && (
              <p className="text-[12.5px] text-ink-faint">No invites yet.</p>
            )}
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-[10px] border border-line p-3">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[inv.status] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px]">{inv.email}</p>
                  <p className="eyebrow mt-0.5">{inv.status}</p>
                </div>
                {inv.status === "pending" && (
                  <button onClick={() => copyLink(inv.token)} className="eyebrow text-brand hover:text-ink">
                    {copied === inv.token ? "copied" : "copy link"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Members */}
        <section className="card fade-up p-6" style={{ animationDelay: "60ms" }}>
          <p className="eyebrow mb-4">Members · {members.length}</p>
          <ul className="flex flex-col gap-2">
            {members.length === 0 && <p className="text-[12.5px] text-ink-faint">No members loaded.</p>}
            {members.map((m) => {
              const name = displayName(m.profiles);
              return (
                <li key={m.user_id} className="flex items-center gap-3 rounded-[10px] border border-line p-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-[#0b0e1a]"
                    style={{ background: accentForUser(m.user_id) }}
                  >
                    {initials(name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{name}</p>
                    <p className="truncate text-[11px] text-ink-faint">{m.profiles?.email}</p>
                  </div>
                  <span
                    className="chip"
                    style={{
                      background: "color-mix(in srgb, var(--brand) 14%, transparent)",
                      color: m.role === "admin" ? "var(--brand)" : "var(--ink-soft)",
                    }}
                  >
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
