"use client";

// Workspaces: create a cluster (you become its admin) or join one with a code,
// and switch between the workspaces you belong to. Create/join go through the
// cluster-create / cluster-join Edge Functions; the active workspace's join
// code is shown so admins/members can share it.
import { useEffect, useState } from "react";
import { useCluster } from "@/components/cluster";
import { createCluster, fetchClusterJoinCode, joinCluster } from "@/lib/queries";

export default function WorkspacesPage() {
  const { memberships, active, setActiveId, refresh } = useCluster();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = active ? fetchClusterJoinCode(active.id) : Promise.resolve(null);
    load
      .then((c) => !cancelled && setJoinCode(c))
      .catch(() => !cancelled && setJoinCode(null));
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createCluster(trimmed);
      setName("");
      setJoinCode(created.join_code);
      setNotice(`Created "${created.name}". Share code ${created.join_code} to invite teammates.`);
      await refresh(created.cluster_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the workspace.");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    const trimmed = code.trim();
    if (!trimmed || joining) return;
    setJoining(true);
    setError(null);
    setNotice(null);
    try {
      const joined = await joinCluster(trimmed);
      setCode("");
      setNotice(`Joined "${joined.name}" as ${joined.role}.`);
      await refresh(joined.cluster_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the workspace.");
    } finally {
      setJoining(false);
    }
  }

  function copyCode() {
    if (!joinCode) return;
    navigator.clipboard?.writeText(joinCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 pb-24 sm:px-8 md:pb-12">
      <header className="fade-up">
        <p className="eyebrow">Workspaces</p>
        <h1 className="font-display mt-3 text-[2.2rem] leading-tight sm:text-4xl">
          Create or join a <span className="italic text-brand">workspace</span>
        </h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          Make a workspace to become its admin, then share the join code. Anyone with the
          code joins as a member and starts contributing to the shared graph.
        </p>
      </header>

      {(notice || error) && (
        <p className={`text-[13px] ${error ? "text-[var(--peach)]" : "text-ink-soft"}`}>
          {error ?? notice}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create */}
        <section className="card fade-up p-6">
          <p className="eyebrow mb-4">Create a workspace</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Acme Engineering"
              maxLength={80}
              className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="btn-grad shrink-0 px-4 text-[13px] disabled:opacity-40"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </section>

        {/* Join */}
        <section className="card fade-up p-6" style={{ animationDelay: "60ms" }}>
          <p className="eyebrow mb-4">Join with a code</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="ABCD2345"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] uppercase tracking-[0.18em] outline-none transition focus:border-brand"
            />
            <button
              onClick={handleJoin}
              disabled={joining || !code.trim()}
              className="btn-grad shrink-0 px-4 text-[13px] disabled:opacity-40"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
        </section>
      </div>

      {/* Your workspaces + active join code */}
      <section className="card fade-up p-6" style={{ animationDelay: "120ms" }}>
        <p className="eyebrow mb-4">Your workspaces · {memberships.length}</p>
        {memberships.length === 0 ? (
          <p className="text-[12.5px] text-ink-faint">
            You&apos;re not in any workspace yet. Create one or join with a code above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => {
              const on = active?.id === m.cluster_id;
              return (
                <li
                  key={m.cluster_id}
                  className="flex items-center gap-3 rounded-[10px] border border-line p-3"
                  style={on ? { borderColor: "var(--brand)" } : undefined}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: on ? "var(--brand)" : "var(--ink-faint)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{m.clusters?.name ?? "Workspace"}</p>
                    <p className="eyebrow mt-0.5">{m.role}</p>
                  </div>
                  {on ? (
                    <span className="eyebrow text-brand">active</span>
                  ) : (
                    <button onClick={() => setActiveId(m.cluster_id)} className="eyebrow text-ink-soft hover:text-ink">
                      switch
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {active && joinCode && (
          <div className="mt-5 flex items-center gap-3 rounded-[10px] border border-line bg-surface-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Join code · {active.name}</p>
              <p className="mt-1 font-mono text-[18px] tracking-[0.22em]">{joinCode}</p>
            </div>
            <button onClick={copyCode} className="eyebrow text-brand hover:text-ink">
              {copied ? "copied" : "copy"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
