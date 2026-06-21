// Pure ingestion helpers (no Deno/Supabase deps) for agent-sync. The desktop
// already dedups captures, but identical descriptors can still arrive (multiple
// clients, retries, races); these back the cheap server-side dedup that runs
// BEFORE the paid embedding call, à la FNDR's "dedup before the expensive step".

export interface Descriptor {
  app: string;
  topic: string;
  concept: string;
  error_type: string | null;
}

// Stable fingerprint for "the same observation": case- and whitespace-
// insensitive over the descriptor's semantic fields.
export function descriptorFingerprint(d: Descriptor): string {
  return [d.app, d.topic, d.concept, d.error_type ?? ""]
    .map((s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

// The text we embed — also stored for provenance / future reindexing.
export function embedText(d: Descriptor): string {
  return `${d.app} | ${d.topic} | ${d.concept}` +
    (d.error_type ? ` | ${d.error_type}` : "");
}

// ISO cutoff: rows newer than this from the same user are recent duplicates.
export function dedupeSince(windowMinutes: number, now = Date.now()): string {
  return new Date(now - windowMinutes * 60_000).toISOString();
}
