// Browser data-access helpers. All queries run through the anon Supabase client
// and are therefore constrained by Row Level Security (cluster membership).
import { createBrowserClient } from "./supabase/client";
import type { SemanticEdge, SemanticNode } from "@/types/graph";

export interface ClusterMembership {
  id: string;
  name: string;
  role: "admin" | "member";
}

export interface MemberProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "member";
}

export interface CurrentUser {
  id: string;
  full_name: string | null;
  email: string;
}

// Clusters the signed-in user belongs to, with their role in each.
export async function getMyClusters(): Promise<ClusterMembership[]> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from("cluster_members")
    .select("role, clusters ( id, name )")
    .order("joined_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const cluster = row.clusters as unknown as { id: string; name: string } | null;
    if (!cluster) return [];
    return [{ id: cluster.id, name: cluster.name, role: row.role as "admin" | "member" }];
  });
}

// Profiles of everyone sharing the given cluster (for teammate labels/colors),
// each annotated with their role in the cluster.
export async function getClusterMembers(clusterId: string): Promise<MemberProfile[]> {
  const supabase = createBrowserClient();
  const { data: members, error: memberErr } = await supabase
    .from("cluster_members")
    .select("user_id, role")
    .eq("cluster_id", clusterId);
  if (memberErr) throw memberErr;

  const rows = members ?? [];
  if (rows.length === 0) return [];
  const roleById = new Map(rows.map((m) => [m.user_id, m.role as "admin" | "member"]));

  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...roleById.keys()]);
  if (profileErr) throw profileErr;

  return (profiles ?? []).map((p) => ({
    id: p.id as string,
    full_name: (p.full_name as string | null) ?? null,
    email: p.email as string,
    role: roleById.get(p.id as string) ?? "member",
  }));
}

// The signed-in user's profile (id + name + email).
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    full_name: (profile?.full_name as string | null) ?? null,
    email: (profile?.email as string | undefined) ?? user.email ?? "",
  };
}

// Lightweight node/edge counts for the active cluster (overview stats).
export async function getGraphCounts(
  clusterId: string,
): Promise<{ nodes: number; edges: number }> {
  const supabase = createBrowserClient();
  const [nodesRes, edgesRes] = await Promise.all([
    supabase
      .from("semantic_nodes")
      .select("id", { count: "exact", head: true })
      .eq("cluster_id", clusterId),
    supabase
      .from("semantic_edges")
      .select("id", { count: "exact", head: true })
      .eq("cluster_id", clusterId),
  ]);
  return { nodes: nodesRes.count ?? 0, edges: edgesRes.count ?? 0 };
}

// Existing nodes + edges for a cluster (initial graph load before realtime).
export async function getGraph(
  clusterId: string,
): Promise<{ nodes: SemanticNode[]; edges: SemanticEdge[] }> {
  const supabase = createBrowserClient();
  const [nodesRes, edgesRes] = await Promise.all([
    supabase
      .from("semantic_nodes")
      .select("id, user_id, cluster_id, app, topic, concept, error_type, created_at")
      .eq("cluster_id", clusterId)
      .order("created_at", { ascending: true }),
    supabase
      .from("semantic_edges")
      .select(
        "id, cluster_id, source_node_id, target_node_id, type, explanation, similarity, created_at",
      )
      .eq("cluster_id", clusterId),
  ]);
  if (nodesRes.error) throw nodesRes.error;
  if (edgesRes.error) throw edgesRes.error;
  return {
    nodes: (nodesRes.data ?? []) as SemanticNode[],
    edges: (edgesRes.data ?? []) as SemanticEdge[],
  };
}
