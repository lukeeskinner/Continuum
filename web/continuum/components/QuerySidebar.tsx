"use client";

// Chat-style query sidebar. Users type (or speak) a question; the component
// posts to the `query-synthesize` Edge Function and renders the citation-aware
// answer. Voice capture -> `voice-transcribe` is stubbed for wiring later.
import { useState } from "react";
import type { QueryResult } from "@/types/graph";

interface Props {
  clusterId: string;
  onResult?: (result: QueryResult) => void;
}

export default function QuerySidebar({ clusterId, onResult }: Props) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/query-synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, cluster_id: clusterId }),
      });
      const data: QueryResult = await res.json();
      setAnswer(data.answer ?? "No answer.");
      onResult?.(data);
    } catch (err) {
      setAnswer(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="flex h-full w-80 flex-col border-l border-zinc-800 bg-zinc-950 p-4 text-zinc-100">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Ask the team graph
      </h2>

      <div className="flex-1 overflow-y-auto rounded-md bg-zinc-900 p-3 text-sm leading-6">
        {loading ? "Synthesizing…" : answer || "Ask a question to query across everyone's work."}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Who's working on RLS?"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          onClick={ask}
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          Ask
        </button>
      </div>
    </aside>
  );
}
