// Typed, RLS-scoped reads against the Continuum schema, plus mappers from DB
// rows to the D3 graph view models. All calls use the authed browser client.
import { getSupabase } from "./supabase/client";
import type {
  MembershipRow,
  MemberRow,
  MemberRole,
  SemanticNodeRow,
  SemanticEdgeRow,
  InviteRow,
} from "@/types/db";
import type { GraphLink, GraphNode } from "@/types/graph";

export async function fetchMemberships(): Promise<MembershipRow[]> {
  const { data, error } = await getSupabase()
    .from("cluster_members")
    .select("cluster_id, role, joined_at, clusters(id, name, created_at)")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MembershipRow[];
}

export async function fetchMembers(clusterId: string): Promise<MemberRow[]> {
  const { data, error } = await getSupabase()
    .from("cluster_members")
    .select("user_id, role, joined_at, profiles(id, email, full_name, avatar_url)")
    .eq("cluster_id", clusterId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MemberRow[];
}

export async function fetchNodes(clusterId: string, limit = 500): Promise<SemanticNodeRow[]> {
  const { data, error } = await getSupabase()
    .from("semantic_nodes")
    .select("id, user_id, cluster_id, app, topic, concept, error_type, created_at")
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SemanticNodeRow[];
}

export async function fetchEdges(clusterId: string, limit = 1000): Promise<SemanticEdgeRow[]> {
  const { data, error } = await getSupabase()
    .from("semantic_edges")
    .select("id, cluster_id, source_node_id, target_node_id, type, explanation, similarity, created_at")
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SemanticEdgeRow[];
}

export async function fetchInvites(clusterId: string): Promise<InviteRow[]> {
  const { data, error } = await getSupabase()
    .from("invites")
    .select("id, cluster_id, email, token, status, invited_by, created_at")
    .eq("cluster_id", clusterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InviteRow[];
}

// ---- workspace create / join (via Edge Functions) ----

export interface CreatedCluster {
  cluster_id: string;
  name: string;
  join_code: string;
  role: MemberRole;
}

export interface JoinedCluster {
  cluster_id: string;
  name: string;
  role: MemberRole;
}

// Edge Functions reject with a JSON `{ error }` body; supabase-js surfaces that
// as a FunctionsHttpError whose `.context` is the raw Response. Pull the
// server's message out so the UI can show "invalid join code" etc.
async function functionErrorMessage(error: { message: string; context?: unknown }): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
  try {
    const body = (await ctx?.json?.()) as { error?: string } | undefined;
    if (body?.error) return body.error;
  } catch {
    /* fall through to the generic message */
  }
  return error.message || "Request failed.";
}

export async function createCluster(name: string): Promise<CreatedCluster> {
  const { data, error } = await getSupabase().functions.invoke<CreatedCluster>("cluster-create", {
    body: { name },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data) throw new Error("Workspace creation returned no data.");
  return data;
}

export async function joinCluster(joinCode: string): Promise<JoinedCluster> {
  const { data, error } = await getSupabase().functions.invoke<JoinedCluster>("cluster-join", {
    body: { join_code: joinCode },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data) throw new Error("Joining the workspace returned no data.");
  return data;
}

/** The shareable join code for a cluster the user belongs to (RLS-scoped). */
export async function fetchClusterJoinCode(clusterId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("clusters")
    .select("join_code")
    .eq("id", clusterId)
    .single();
  if (error) return null;
  return (data as { join_code?: string } | null)?.join_code ?? null;
}

// ---- mappers ----
export function toGraphNodes(rows: SemanticNodeRow[]): GraphNode[] {
  return rows.map((n) => ({
    id: n.id,
    label: n.concept,
    app: n.app,
    teammate: n.user_id,
    colorKey: n.user_id,
  }));
}

export function toGraphLinks(rows: SemanticEdgeRow[]): GraphLink[] {
  return rows.map((e) => ({
    source: e.source_node_id,
    target: e.target_node_id,
    type: e.type,
  }));
}
