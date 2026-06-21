"use client";

// Cluster context: resolves which cluster the signed-in user is working in
// (from cluster_members) and exposes the live member roster.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { fetchMemberships, fetchMembers } from "@/lib/queries";
import { getAccessToken } from "@/lib/supabase/client";
import type { MembershipRow, MemberRow, MemberRole } from "@/types/db";

export interface ActiveCluster {
  id: string;
  name: string;
  role: MemberRole;
}

interface ClusterState {
  loading: boolean;
  memberships: MembershipRow[];
  active: ActiveCluster | null;
  setActiveId: (id: string) => void;
  members: MemberRow[];
  online: Set<string>;
  refreshMembers: () => Promise<void>;
  /** Re-fetch memberships (e.g. after create/join) and optionally switch. */
  refresh: (preferId?: string) => Promise<void>;
}

const Ctx = createContext<ClusterState | null>(null);

export function useCluster(): ClusterState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCluster must be used within <ClusterProvider>");
  return c;
}

export function ClusterProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ClusterProvider only mounts for an authenticated user; bail otherwise.
    if (!user) return;
    let cancelled = false;
    fetchMemberships()
      .then((ms) => {
        if (cancelled) return;
        setMemberships(ms);
        const pref = process.env.NEXT_PUBLIC_DEMO_CLUSTER_ID;
        const ids = ms.map((m) => m.cluster_id);
        setActiveId(pref && ids.includes(pref) ? pref : ids[0] ?? null);
      })
      .catch(() => !cancelled && setMemberships([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadMembers = useCallback(async (id: string) => {
    try {
      setMembers(await fetchMembers(id));
    } catch {
      setMembers([]);
    }
  }, []);

  const refresh = useCallback(async (preferId?: string) => {
    const ms = await fetchMemberships().catch(() => [] as MembershipRow[]);
    setMemberships(ms);
    const ids = ms.map((m) => m.cluster_id);
    setActiveId((cur) => {
      if (preferId && ids.includes(preferId)) return preferId;
      if (cur && ids.includes(cur)) return cur;
      return ids[0] ?? null;
    });
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetchMembers(activeId)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => !cancelled && setMembers([]));
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Presence: heartbeat ourselves into the cluster's online set + poll it.
  useEffect(() => {
    if (!activeId) return;
    let stop = false;
    const cid = activeId;
    const apply = (j: unknown) => {
      const list = (j as { online?: string[] })?.online;
      if (!stop && Array.isArray(list)) setOnline(new Set(list));
    };
    const beat = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cluster_id: cid }),
        });
        apply(await res.json());
      } catch {
        /* best-effort */
      }
    };
    const poll = async () => {
      try {
        apply(await (await fetch(`/api/presence?cluster_id=${cid}`)).json());
      } catch {
        /* best-effort */
      }
    };
    beat();
    const a = setInterval(beat, 20_000);
    const b = setInterval(poll, 12_000);
    return () => {
      stop = true;
      clearInterval(a);
      clearInterval(b);
    };
  }, [activeId]);

  const activeRow = memberships.find((m) => m.cluster_id === activeId) ?? null;
  const active: ActiveCluster | null = activeRow
    ? { id: activeRow.cluster_id, name: activeRow.clusters?.name ?? "Workspace", role: activeRow.role }
    : null;

  return (
    <Ctx.Provider
      value={{
        loading,
        memberships,
        active,
        setActiveId,
        members,
        online,
        refreshMembers: () => (activeId ? loadMembers(activeId) : Promise.resolve()),
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
