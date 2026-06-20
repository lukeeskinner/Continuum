// Presentation config (not data): the curated spectrum, edge-type metadata,
// and helpers to map live records (user ids, profiles) onto visuals.
import type { EdgeType } from "@/types/graph";
import type { Profile } from "@/types/db";

export type AccentKey = "lavender" | "sky" | "mint" | "pink" | "peach" | "lemon";

export const ACCENTS: Record<AccentKey, string> = {
  lavender: "#8e7bf0", // iris (brand)
  sky: "#4f9bf0", // azure
  mint: "#2fc4b2", // teal
  pink: "#e0609b", // rose
  peach: "#f2a93c", // amber
  lemon: "#f26d5b", // coral
};

// Stable spectrum order used when coloring people.
const ORDER: AccentKey[] = ["lavender", "sky", "mint", "pink", "peach", "lemon"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function accentKeyForUser(userId: string): AccentKey {
  return ORDER[hash(userId) % ORDER.length];
}

export function accentForUser(userId: string): string {
  return ACCENTS[accentKeyForUser(userId)];
}

export const EDGE_META: Record<
  EdgeType,
  { label: string; color: string; description: string }
> = {
  RELATED_TO: { label: "Related to", color: "#4f9bf0", description: "Topically adjacent work across teammates" },
  BUILDS_ON: { label: "Builds on", color: "#2fc4b2", description: "One concept extends or implements another" },
  CONTRADICTS: { label: "Contradicts", color: "#f26d5b", description: "Conflicting findings worth reconciling" },
};

export function displayName(p: Pick<Profile, "full_name" | "email"> | null | undefined): string {
  if (!p) return "Unknown";
  return p.full_name?.trim() || p.email?.split("@")[0] || "Unknown";
}

export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail;
  const parts = base.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(nameOrEmail: string): string {
  const base = nameOrEmail.includes("@") ? nameOrEmail.split("@")[0] : nameOrEmail;
  return base.replace(/[._-]+/g, " ").trim().split(/\s+/)[0] || base;
}
