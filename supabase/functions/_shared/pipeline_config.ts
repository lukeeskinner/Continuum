// Centralized, tunable pipeline knobs — a single source of truth (FNDR-style)
// so retrieval/ingestion/connection behavior isn't scattered as magic numbers
// across the Edge Functions. A few are overridable via env for ops tuning
// without code changes.
import { optionalEnv } from "./env.ts";

function num(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

export const PIPELINE = {
  retrieval: {
    // Candidates pulled from EACH branch (vector + keyword) before fusion.
    candidatesPerBranch: num("RETRIEVAL_CANDIDATES", 20),
    // Seed nodes kept after fusion + rerank, before subgraph expansion.
    topK: num("RETRIEVAL_TOP_K", 12),
    // Cap on total nodes (seeds + 1-hop neighbors) handed to the synthesizer.
    subgraphMax: num("RETRIEVAL_SUBGRAPH_MAX", 40),
    // Hybrid fusion weights (rank-based, so the scales are comparable).
    vectorWeight: num("FUSION_VECTOR_WEIGHT", 0.6),
    keywordWeight: num("FUSION_KEYWORD_WEIGHT", 0.4),
    // Ebbinghaus-style recency decay: a node's weight halves every
    // halfLifeHours, bounded below by decayFloor so old-but-relevant nodes
    // still surface.
    halfLifeHours: num("RECENCY_HALF_LIFE_HOURS", 72),
    decayFloor: num("RECENCY_DECAY_FLOOR", 0.3),
    // Drop fused candidates whose final score is below this.
    relevanceFloor: num("RELEVANCE_FLOOR", 0.05),
  },
  ingest: {
    // Skip a new node if an identical descriptor from the same user landed
    // within this window — a server-side backstop to the desktop's dedup.
    dedupeWindowMinutes: num("INGEST_DEDUPE_WINDOW_MIN", 5),
  },
  connect: {
    // Cosine threshold + cap for cross-person connection candidates.
    similarityThreshold: num("CONNECTION_SIMILARITY_THRESHOLD", 0.82),
    maxPairs: num("CONNECTION_MAX_PAIRS", 50),
  },
} as const;
