"use client";

// Cluster context: resolves which cluster the signed-in user is working in
// (from cluster_members) and exposes the live member roster.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { fetchMemberships, fetchMembers } from "@/lib/queries";
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
  refreshMembers: () => Promise<void>;
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
        refreshMembers: () => (activeId ? loadMembers(activeId) : Promise.resolve()),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
