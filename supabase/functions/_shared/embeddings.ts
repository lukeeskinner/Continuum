// Embedding generation.
//
// DEMO MODE — no external embeddings provider (no OpenAI / Voyage / etc.).
// `embed()` returns a fixed-dimension zero-vector so the ingestion and query
// paths run end-to-end without any embeddings API key. Consequences:
//   - Redis VSS / pgvector similarity search is inert (all vectors identical),
//     so `connection-detect` finds no candidates and spends no Claude budget.
//   - Cross-person connections for the demo are curated directly as rows in
//     `semantic_edges` instead of being inferred.
// To restore real semantic search later, swap `embed()` back to a real provider
// and make sure it returns exactly EMBEDDING_DIM dimensions (or migrate the
// `vector(1536)` column to match the new provider's dimensionality).
export const EMBEDDING_DIM = 1536;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function embed(_text: string): Promise<number[]> {
  return new Array(EMBEDDING_DIM).fill(0);
}

// Float32 little-endian buffer for Redis VSS storage / queries.
export function toFloat32Buffer(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer);
}
