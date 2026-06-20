// Row shapes for the Continuum Postgres schema (see supabase/migrations).
import type { EdgeType } from "./graph";

export type MemberRole = "admin" | "member";
export type InviteStatus = "pending" | "accepted" | "revoked";
export type SourceType = "SCREEN" | "BROWSER" | "VOICE" | "MANUAL";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ClusterRow {
  id: string;
  name: string;
  created_at: string;
}

// cluster_members joined with its cluster (used to resolve the active cluster).
export interface MembershipRow {
  cluster_id: string;
  role: MemberRole;
  joined_at: string;
  clusters: ClusterRow | null;
}

// cluster_members joined with the member's profile (roster view).
export interface MemberRow {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profiles: Profile | null;
}

export interface SemanticNodeRow {
  id: string;
  user_id: string;
  cluster_id: string;
  app: string;
  topic: string;
  concept: string;
  error_type: string | null;
  source_type?: SourceType; // present only once migration 0003 is applied
  created_at: string;
}

export interface SemanticEdgeRow {
  id: string;
  cluster_id: string;
  source_node_id: string;
  target_node_id: string;
  type: EdgeType;
  explanation: string;
  similarity: number;
  created_at: string;
}

export interface InviteRow {
  id: string;
  cluster_id: string;
  email: string;
  token: string;
  status: InviteStatus;
  invited_by: string | null;
  created_at: string;
}
