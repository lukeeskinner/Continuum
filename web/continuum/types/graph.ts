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

// query-synthesize response shape. `answer` is plain prose with inline
// citations of the form [Name@HH:MM]; the subgraph lists the cited nodes/edges.
export interface QueryResult {
  answer: string;
  subgraph: {
    nodes: Array<{
      id: string;
      label?: string;
      concept?: string;
      app?: string;
      topic?: string;
      teammate?: string;
      created_at?: string;
    }>;
    edges: Array<{ source: string; target: string; type: EdgeType }>;
  };
}
