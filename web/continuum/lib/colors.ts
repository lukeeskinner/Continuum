// Deterministic per-user accent colors + avatar initials.
// Real teammates have UUID ids (not the curated mock palette keys), so node
// and avatar colors are derived by hashing a stable key into a fixed palette.

export const ACCENT_PALETTE = [
  "#9d7bff", // lavender
  "#ff7eb6", // pink
  "#59c2ff", // sky
  "#34d6b0", // mint
  "#ffae6b", // peach
  "#f5c518", // lemon
];

function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Stable color for any key (user id, name, etc.).
export function colorForKey(key: string): string {
  return ACCENT_PALETTE[hash(key) % ACCENT_PALETTE.length];
}

// 1–2 letter initials from a display name, falling back gracefully.
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
