// Embedding generation (OpenAI text-embedding-3-small, 1536 dims).
import { ENV } from "./env.ts";

export const EMBEDDING_DIM = 1536;

export async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.OPENAI_API_KEY()}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.data[0].embedding as number[];
}

// Float32 little-endian buffer for Redis VSS storage / queries.
export function toFloat32Buffer(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer);
}
