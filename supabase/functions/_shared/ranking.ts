// Pure hybrid-ranking helpers (no Deno/Supabase deps) so they're unit-testable
// in isolation. Fuses ranked candidate lists from multiple retrieval branches
// (vector, keyword) with scale-free rank-based scoring, weights each branch,
// applies an Ebbinghaus-style recency decay, drops low-relevance hits, and
// returns the top fused candidates.
//
// Inspired by FNDR's hybrid retrieval (vector + keyword fusion + decay rerank),
// adapted to Continuum's pgvector/Redis + Postgres full-text branches.

export interface Branch {
  weight: number;
  ids: string[]; // ordered best-first
}

export interface FuseOptions {
  createdAtById?: Record<string, number>; // id -> epoch ms (for recency decay)
  now?: number;
  halfLifeHours?: number;
  decayFloor?: number;
  relevanceFloor?: number;
  topN?: number;
}

export interface FusedHit {
  id: string;
  score: number;
}

// Score for position `pos` in a branch of length `n`: 1 for the top hit,
// approaching 0 for the last. Rank-based so incomparable raw scores (cosine
// similarity vs. ts_rank) don't need normalizing before fusion.
function rankScore(pos: number, n: number): number {
  if (n <= 0 || pos < 0) return 0;
  if (n === 1) return 1;
  return (n - pos) / n;
}

// Weight in [floor, 1]; halves every `halfLifeHours` of age.
export function recencyDecay(
  createdAtMs: number,
  now: number,
  halfLifeHours: number,
  floor: number,
): number {
  if (!Number.isFinite(createdAtMs) || halfLifeHours <= 0) return 1;
  const ageHours = Math.max(0, (now - createdAtMs) / 3_600_000);
  return Math.max(floor, Math.pow(0.5, ageHours / halfLifeHours));
}

export function fuse(branches: Branch[], opts: FuseOptions = {}): FusedHit[] {
  const {
    createdAtById,
    now = Date.now(),
    halfLifeHours = 72,
    decayFloor = 0.3,
    relevanceFloor = 0,
    topN = 20,
  } = opts;

  const totalWeight = branches.reduce((s, b) => s + (b.weight > 0 ? b.weight : 0), 0) || 1;

  // Weighted, rank-based base score per id (summed across branches it appears in).
  const base = new Map<string, number>();
  for (const b of branches) {
    if (b.weight <= 0) continue;
    const n = b.ids.length;
    b.ids.forEach((id, pos) => {
      const add = (b.weight / totalWeight) * rankScore(pos, n);
      base.set(id, (base.get(id) ?? 0) + add);
    });
  }

  const hits: FusedHit[] = [];
  for (const [id, baseScore] of base) {
    let score = baseScore;
    if (createdAtById && id in createdAtById) {
      score *= recencyDecay(createdAtById[id], now, halfLifeHours, decayFloor);
    }
    if (score >= relevanceFloor) hits.push({ id, score });
  }
  // Deterministic ordering: score desc, then id asc for ties.
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return hits.slice(0, topN);
}
