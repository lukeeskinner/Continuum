// Shared graph types used across the dashboard and API routes.

export type EdgeType = "RELATED_TO" | "CONTRADICTS" | "BUILDS_ON";

export interface SemanticNode {
  id: string;
  user_id: string;
  cluster_id: string;
  app: string;
  topic: string;
  concept: string;
  error_type: string | null;
  created_at: string;
}

export interface SemanticEdge {
  id: string;
  cluster_id: string;
  source_node_id: string;
  target_node_id: string;
  type: EdgeType;
  explanation: string;
  similarity: number;
  created_at: string;
}

// D3 force-graph view models.
export interface GraphNode {
  id: string;
  label: string;
  app: string;
  teammate: string;
  // Stable color key (per teammate) assigned client-side.
  colorKey: string;
  // Optional metadata, populated from real semantic_nodes (absent for mock).
  topic?: string;
  errorType?: string | null;
  createdAt?: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  type: EdgeType;
}

// Realtime events broadcast over Redis `cluster:{id}:events`.
export type ClusterEvent =
  | { event: "node_added"; data: SemanticNode }
  | { event: "edge_added"; data: { id: string; source: string; target: string; type: EdgeType } };

// query-synthesize response shape.
export interface QueryResult {
  answer: string;
  subgraph: {
    nodes: Array<{ id: string; label?: string; concept?: string; teammate?: string }>;
    edges: Array<{ source?: string; target?: string; source_node_id?: string; target_node_id?: string; type: EdgeType }>;
  };
}
