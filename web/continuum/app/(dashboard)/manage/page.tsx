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

export default function ManagePage() {
  const { active, members } = useCluster();
  const isAdmin = active?.role === "admin";

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    fetchInvites(active.id)
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [active]);

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
