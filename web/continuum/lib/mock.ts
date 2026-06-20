// Rich mock dataset for the Continuum dashboard shells.
// Lets every view render a believable demo with no backend running.
// Replace with live Supabase / Redis data as wiring lands.

import type { EdgeType, GraphLink, GraphNode } from "@/types/graph";

export type AccentKey =
  | "lavender"
  | "pink"
  | "sky"
  | "mint"
  | "peach"
  | "lemon";

export const ACCENTS: Record<AccentKey, string> = {
  lavender: "#8e7bf0", // iris (brand)
  pink: "#e0609b",     // rose
  sky: "#4f9bf0",      // azure
  mint: "#2fc4b2",     // teal (presence)
  peach: "#f2a93c",    // amber (signal)
  lemon: "#f26d5b",    // coral
};

export type Role = "Manager" | "Member" | "Viewer";

export interface Teammate {
  id: string;
  name: string;
  handle: string;
  initials: string;
  accent: AccentKey;
  role: Role;
  online: boolean;
  app: string; // what they're focused on right now
  focus: string; // current concept their agent is observing
  lastActive: string; // human label
  nodeCount: number;
  // mock Redis rate-limiter counters
  tokensThisMin: number;
  tokenLimit: number;
}

export const TEAMMATES: Teammate[] = [
  {
    id: "u_luke",
    name: "Luke Skinner",
    handle: "@luke",
    initials: "LS",
    accent: "lavender",
    role: "Manager",
    online: true,
    app: "Cursor",
    focus: "transformer attention masking",
    lastActive: "now",
    nodeCount: 38,
    tokensThisMin: 12400,
    tokenLimit: 50000,
  },
  {
    id: "u_maya",
    name: "Maya Chen",
    handle: "@maya",
    initials: "MC",
    accent: "pink",
    role: "Member",
    online: true,
    app: "arXiv",
    focus: "FlashAttention numerical stability",
    lastActive: "now",
    nodeCount: 51,
    tokensThisMin: 28900,
    tokenLimit: 50000,
  },
  {
    id: "u_diego",
    name: "Diego Alvarez",
    handle: "@diego",
    initials: "DA",
    accent: "sky",
    role: "Member",
    online: true,
    app: "VS Code",
    focus: "Supabase RLS policies",
    lastActive: "now",
    nodeCount: 44,
    tokensThisMin: 8300,
    tokenLimit: 50000,
  },
  {
    id: "u_priya",
    name: "Priya Nair",
    handle: "@priya",
    initials: "PN",
    accent: "mint",
    role: "Member",
    online: false,
    app: "Notion",
    focus: "pgvector index tuning",
    lastActive: "14m ago",
    nodeCount: 29,
    tokensThisMin: 0,
    tokenLimit: 50000,
  },
  {
    id: "u_sam",
    name: "Sam Okafor",
    handle: "@sam",
    initials: "SO",
    accent: "peach",
    role: "Member",
    online: true,
    app: "Figma",
    focus: "graph view interaction design",
    lastActive: "now",
    nodeCount: 22,
    tokensThisMin: 4100,
    tokenLimit: 50000,
  },
  {
    id: "u_wei",
    name: "Wei Zhang",
    handle: "@wei",
    initials: "WZ",
    accent: "lemon",
    role: "Viewer",
    online: false,
    app: "Linear",
    focus: "sprint planning",
    lastActive: "1h ago",
    nodeCount: 11,
    tokensThisMin: 0,
    tokenLimit: 50000,
  },
];

export function teammateById(id: string): Teammate | undefined {
  return TEAMMATES.find((t) => t.id === id);
}

export function accentFor(id: string): string {
  return ACCENTS[teammateById(id)?.accent ?? "lavender"];
}

// ---------------------------------------------------------------------------
// Semantic graph: concepts each teammate's agent captured + cross-person edges
// ---------------------------------------------------------------------------

interface MockNode {
  id: string;
  concept: string;
  app: string;
  topic: string;
  user: string; // teammate id
}

export const MOCK_NODES: MockNode[] = [
  // Luke — attention internals
  { id: "n1", concept: "Attention mask broadcasting", app: "Cursor", topic: "transformers", user: "u_luke" },
  { id: "n2", concept: "Causal masking off-by-one", app: "Cursor", topic: "transformers", user: "u_luke" },
  { id: "n3", concept: "KV-cache layout", app: "Cursor", topic: "inference", user: "u_luke" },
  { id: "n4", concept: "Softmax overflow guard", app: "Terminal", topic: "numerics", user: "u_luke" },
  // Maya — papers
  { id: "n5", concept: "FlashAttention v2", app: "arXiv", topic: "transformers", user: "u_maya" },
  { id: "n6", concept: "Numerical stability of softmax", app: "arXiv", topic: "numerics", user: "u_maya" },
  { id: "n7", concept: "Online softmax recomputation", app: "arXiv", topic: "numerics", user: "u_maya" },
  { id: "n8", concept: "RoPE positional encoding", app: "Notion", topic: "transformers", user: "u_maya" },
  { id: "n9", concept: "Long-context eval suite", app: "arXiv", topic: "evaluation", user: "u_maya" },
  // Diego — backend / RLS
  { id: "n10", concept: "Row-level security policies", app: "VS Code", topic: "supabase", user: "u_diego" },
  { id: "n11", concept: "JWT claims in RLS", app: "VS Code", topic: "supabase", user: "u_diego" },
  { id: "n12", concept: "Cluster isolation tests", app: "VS Code", topic: "supabase", user: "u_diego" },
  { id: "n13", concept: "Edge Function auth", app: "VS Code", topic: "supabase", user: "u_diego" },
  // Priya — vectors
  { id: "n14", concept: "pgvector HNSW tuning", app: "Notion", topic: "vectors", user: "u_priya" },
  { id: "n15", concept: "Cosine vs inner product", app: "Notion", topic: "vectors", user: "u_priya" },
  { id: "n16", concept: "Embedding dim 1536", app: "Notion", topic: "vectors", user: "u_priya" },
  // Sam — design
  { id: "n17", concept: "Force-graph hover states", app: "Figma", topic: "design", user: "u_sam" },
  { id: "n18", concept: "Edge-type color legend", app: "Figma", topic: "design", user: "u_sam" },
  { id: "n19", concept: "Citation card layout", app: "Figma", topic: "design", user: "u_sam" },
  // Wei — planning
  { id: "n20", concept: "Demo script outline", app: "Linear", topic: "planning", user: "u_wei" },
  { id: "n21", concept: "Privacy filter story", app: "Linear", topic: "planning", user: "u_wei" },
];

export const MOCK_EDGES: Array<{
  source: string;
  target: string;
  type: EdgeType;
  explanation: string;
}> = [
  { source: "n5", target: "n1", type: "BUILDS_ON", explanation: "FlashAttention v2 reformulates the masked attention Luke is editing." },
  { source: "n6", target: "n4", type: "RELATED_TO", explanation: "Both address softmax numerical overflow." },
  { source: "n7", target: "n6", type: "BUILDS_ON", explanation: "Online softmax is the technique behind the stability result." },
  { source: "n2", target: "n5", type: "RELATED_TO", explanation: "Causal masking is central to the FlashAttention kernel." },
  { source: "n4", target: "n7", type: "BUILDS_ON", explanation: "Overflow guard implements online-softmax recomputation." },
  { source: "n11", target: "n10", type: "BUILDS_ON", explanation: "JWT claims extend the base RLS policy." },
  { source: "n12", target: "n10", type: "RELATED_TO", explanation: "Isolation tests validate the RLS policies." },
  { source: "n13", target: "n11", type: "RELATED_TO", explanation: "Edge Function auth reuses the same JWT claims." },
  { source: "n15", target: "n16", type: "RELATED_TO", explanation: "Distance metric choice depends on embedding dimensionality." },
  { source: "n14", target: "n16", type: "BUILDS_ON", explanation: "HNSW index is built over the 1536-dim embeddings." },
  { source: "n8", target: "n5", type: "RELATED_TO", explanation: "RoPE is commonly paired with FlashAttention." },
  { source: "n15", target: "n6", type: "CONTRADICTS", explanation: "Inner-product scaling note conflicts with the stability assumptions." },
  { source: "n18", target: "n17", type: "BUILDS_ON", explanation: "Color legend builds on the hover-state spec." },
  { source: "n19", target: "n18", type: "RELATED_TO", explanation: "Citation cards reuse the edge-type palette." },
  { source: "n3", target: "n5", type: "RELATED_TO", explanation: "KV-cache layout interacts with FlashAttention tiling." },
  { source: "n9", target: "n5", type: "RELATED_TO", explanation: "Long-context eval stresses the attention kernel." },
  { source: "n21", target: "n10", type: "RELATED_TO", explanation: "Privacy story references the RLS isolation guarantees." },
  { source: "n14", target: "n15", type: "BUILDS_ON", explanation: "Tuning depends on the chosen distance metric." },
];

export function buildGraphNodes(): GraphNode[] {
  return MOCK_NODES.map((n) => ({
    id: n.id,
    label: n.concept,
    app: n.app,
    teammate: n.user,
    colorKey: n.user,
  }));
}

export function buildGraphLinks(): GraphLink[] {
  return MOCK_EDGES.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));
}

// ---------------------------------------------------------------------------
// Edge-type metadata (shared by graph legend + query view)
// ---------------------------------------------------------------------------

export const EDGE_META: Record<
  EdgeType,
  { label: string; color: string; description: string }
> = {
  RELATED_TO: {
    label: "Related to",
    color: "#4f9bf0",
    description: "Topically adjacent work across teammates",
  },
  BUILDS_ON: {
    label: "Builds on",
    color: "#2fc4b2",
    description: "One concept extends or implements another",
  },
  CONTRADICTS: {
    label: "Contradicts",
    color: "#f26d5b",
    description: "Conflicting findings worth reconciling",
  },
};

// ---------------------------------------------------------------------------
// Activity feed (overview + realtime simulation)
// ---------------------------------------------------------------------------

export type ActivityKind = "node" | "edge" | "member" | "query";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  user: string;
  text: string;
  time: string;
}

export const ACTIVITY: ActivityItem[] = [
  { id: "a1", kind: "edge", user: "u_maya", text: "BUILDS_ON edge surfaced: FlashAttention v2 → Attention mask broadcasting", time: "12s ago" },
  { id: "a2", kind: "node", user: "u_maya", text: "captured “Numerical stability of softmax” from arXiv", time: "48s ago" },
  { id: "a3", kind: "node", user: "u_luke", text: "captured “Softmax overflow guard” in Cursor", time: "1m ago" },
  { id: "a4", kind: "edge", user: "u_priya", text: "CONTRADICTS edge: inner-product scaling vs softmax stability", time: "2m ago" },
  { id: "a5", kind: "member", user: "u_sam", text: "came online", time: "4m ago" },
  { id: "a6", kind: "query", user: "u_diego", text: "asked “who has touched RLS isolation?”", time: "6m ago" },
  { id: "a7", kind: "node", user: "u_diego", text: "captured “JWT claims in RLS” in VS Code", time: "8m ago" },
];

// New nodes that the graph view "streams in" to demo realtime animation.
export const STREAM_NODES: Array<{ node: MockNode; link?: { source: string; target: string; type: EdgeType } }> = [
  {
    node: { id: "s1", concept: "Triton kernel autotuning", app: "Cursor", topic: "transformers", user: "u_luke" },
    link: { source: "s1", target: "n5", type: "BUILDS_ON" },
  },
  {
    node: { id: "s2", concept: "Attention entropy collapse", app: "arXiv", topic: "transformers", user: "u_maya" },
    link: { source: "s2", target: "n2", type: "RELATED_TO" },
  },
  {
    node: { id: "s3", concept: "RLS perf with pgvector", app: "VS Code", topic: "supabase", user: "u_diego" },
    link: { source: "s3", target: "n14", type: "RELATED_TO" },
  },
];

// ---------------------------------------------------------------------------
// Cluster + privacy settings (manager dashboard)
// ---------------------------------------------------------------------------

export interface PrivacyPolicy {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export const PRIVACY_POLICIES: PrivacyPolicy[] = [
  { id: "p1", label: "On-device redaction", description: "Strip PII & secrets before anything leaves a device.", enabled: true },
  { id: "p2", label: "Share semantics only", description: "Push concept embeddings, never raw screenshots.", enabled: true },
  { id: "p3", label: "Anonymize source identity", description: "Scrub author identity on SHARED_ANON nodes.", enabled: false },
  { id: "p4", label: "Block financial apps", description: "Never observe banking / payment windows.", enabled: true },
  { id: "p5", label: "Pause capture after hours", description: "Stop observation outside 9am–7pm local.", enabled: false },
];

export interface ClusterInfo {
  id: string;
  name: string;
  plan: string;
  members: number;
  monthlySpend: number;
  monthlyBudget: number;
  inviteCode: string;
}

export const CLUSTER: ClusterInfo = {
  id: "a904128f-7c42-4f32-bb9a-a82fca92cf3d",
  name: "Continuum Core",
  plan: "Team",
  members: TEAMMATES.length,
  monthlySpend: 18.42,
  monthlyBudget: 25,
  inviteCode: "MESH-7Q2K",
};

// ---------------------------------------------------------------------------
// Query interface mock (answer + citations + attribution)
// ---------------------------------------------------------------------------

export interface Citation {
  id: number;
  nodeId: string;
  user: string;
  concept: string;
  app: string;
  snippet: string;
}

export interface MockQueryResult {
  answer: Array<{ text: string; cite?: number }>;
  citations: Citation[];
  contributors: string[]; // teammate ids
}

export const SUGGESTED_QUERIES = [
  "Who's working on attention numerical stability?",
  "Has anyone solved the softmax overflow bug?",
  "What do we know about Supabase RLS isolation?",
  "Any conflicting findings on distance metrics?",
];

export const MOCK_QUERY: MockQueryResult = {
  answer: [
    { text: "Two teammates are converging on the same softmax overflow problem. " },
    { text: "Maya has been reading FlashAttention v2 and the numerical-stability results on arXiv", cite: 1 },
    { text: ", which directly build on the attention masking Luke is editing in Cursor", cite: 2 },
    { text: ". The recommended fix is the online-softmax recomputation Maya bookmarked", cite: 3 },
    { text: " — Luke's overflow guard already implements part of it. Heads up: Priya logged a note suggesting inner-product scaling that ", },
    { text: "contradicts the stability assumptions", cite: 4 },
    { text: ", so reconcile those before shipping." },
  ],
  citations: [
    { id: 1, nodeId: "n5", user: "u_maya", concept: "FlashAttention v2", app: "arXiv", snippet: "Reformulates masked attention with tiling + online softmax." },
    { id: 2, nodeId: "n1", user: "u_luke", concept: "Attention mask broadcasting", app: "Cursor", snippet: "Editing the causal mask broadcast in the attention block." },
    { id: 3, nodeId: "n7", user: "u_maya", concept: "Online softmax recomputation", app: "arXiv", snippet: "Numerically stable streaming softmax for long contexts." },
    { id: 4, nodeId: "n15", user: "u_priya", concept: "Cosine vs inner product", app: "Notion", snippet: "Notes inner-product scaling may skip the max-subtraction guard." },
  ],
  contributors: ["u_maya", "u_luke", "u_priya"],
};

// Aggregate stats for the overview hero.
export const STATS = {
  nodes: MOCK_NODES.length + 174,
  edges: MOCK_EDGES.length + 63,
  connectionsToday: 27,
  online: TEAMMATES.filter((t) => t.online).length,
};
