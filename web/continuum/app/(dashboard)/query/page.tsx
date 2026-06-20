"use client";

// Ask-the-mesh query interface. Text input + push-to-talk voice capture
// (mocked) -> citation-aware synthesized answer with teammate attribution
// cards and a contributing-subgraph preview.
//
// Wiring later: voice -> `voice-transcribe`, query -> `query-synthesize`.
import { useMemo, useRef, useState } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import {
  MOCK_QUERY,
  SUGGESTED_QUERIES,
  TEAMMATES,
  ACCENTS,
  EDGE_META,
  teammateById,
  buildGraphNodes,
  MOCK_EDGES,
  type MockQueryResult,
} from "@/lib/mock";
import type { GraphLink, GraphNode } from "@/types/graph";
import { IconChat, IconMic, IconSend, IconBolt, IconSpark } from "@/components/icons";

type Status = "idle" | "thinking" | "answered";

export default function QueryPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<MockQueryResult | null>(null);
  const recTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function ask(q?: string) {
    const text = (q ?? query).trim();
    if (!text) return;
    setQuery(text);
    setStatus("thinking");
    setResult(null);
    setTimeout(() => {
      setResult(MOCK_QUERY);
      setStatus("answered");
    }, 1300);
  }

  function toggleMic() {
    if (recording) {
      if (recTimer.current) clearTimeout(recTimer.current);
      setRecording(false);
      return;
    }
    setRecording(true);
    // Simulate Deepgram push-to-talk: capture, then transcribe + ask.
    recTimer.current = setTimeout(() => {
      setRecording(false);
      const sample = SUGGESTED_QUERIES[0];
      ask(sample);
    }, 1900);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-7 pb-24 md:pb-10">
      <header className="fade-up">
        <span className="chip bg-peach/15 text-ink-soft">
          <IconSpark width={13} height={13} className="text-peach" /> cross-person recall
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Ask the <span className="text-gradient">Mesh</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Query across everyone&apos;s work at once. Answers are synthesized with citations and
          attributed back to the teammate who surfaced each idea.
        </p>
      </header>

      {/* Input */}
      <div className="card fade-up mt-6 p-2.5" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-2">
          <IconChat width={20} height={20} className="ml-2 shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Who's working on attention numerical stability?"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-faint sm:text-base"
          />
          <button
            onClick={toggleMic}
            title="Push to talk"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
              recording
                ? "rec-pulse bg-[var(--edge-contradicts)] text-white"
                : "bg-surface-2 text-ink-soft hover:text-ink"
            }`}
          >
            {recording ? (
              <span className="flex h-5 items-end gap-[3px]">
                <span className="eq-bar" style={{ animationDelay: "0ms" }} />
                <span className="eq-bar" style={{ animationDelay: "150ms" }} />
                <span className="eq-bar" style={{ animationDelay: "300ms" }} />
              </span>
            ) : (
              <IconMic width={18} height={18} />
            )}
          </button>
          <button
            onClick={() => ask()}
            disabled={status === "thinking"}
            className="btn-grad grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-50"
          >
            <IconSend width={18} height={18} />
          </button>
        </div>
      </div>

      {recording && (
        <p className="fade-up mt-2 flex items-center gap-2 px-1 text-xs font-medium text-ink-soft">
          <span className="dot-online !bg-[var(--edge-contradicts)] after:!bg-[var(--edge-contradicts)]" />
          Listening… release to transcribe with Deepgram
        </p>
      )}

      {/* Suggested */}
      {status === "idle" && !recording && (
        <div className="fade-up mt-5" style={{ animationDelay: "120ms" }}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Try asking
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="card card-hover px-3.5 py-2 text-left text-sm font-medium text-ink-soft"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thinking */}
      {status === "thinking" && (
        <div className="card fade-up mt-5 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <IconBolt width={16} height={16} className="text-lavender" />
            Synthesizing across {TEAMMATES.length} teammates&apos; graphs…
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="shimmer h-3.5 w-full rounded-full" />
            <div className="shimmer h-3.5 w-[92%] rounded-full" />
            <div className="shimmer h-3.5 w-[78%] rounded-full" />
          </div>
        </div>
      )}

      {/* Answer */}
      {status === "answered" && result && <Answer result={result} />}
    </div>
  );
}

function Answer({ result }: { result: MockQueryResult }) {
  // Contributing subgraph: cited nodes + their direct neighbors (capped).
  const { subNodes, subLinks, highlight } = useMemo(() => {
    const all = buildGraphNodes();
    const citeIds = new Set(result.citations.map((c) => c.nodeId));
    const keep = new Set(citeIds);
    for (const e of MOCK_EDGES) {
      if (citeIds.has(e.source)) keep.add(e.target);
      if (citeIds.has(e.target)) keep.add(e.source);
      if (keep.size >= 15) break;
    }
    const subNodes: GraphNode[] = all.filter((n) => keep.has(n.id));
    const subLinks: GraphLink[] = MOCK_EDGES.filter(
      (e) => keep.has(e.source) && keep.has(e.target),
    ).map((e) => ({ source: e.source, target: e.target, type: e.type }));
    return { subNodes, subLinks, highlight: citeIds };
  }, [result]);

  const contributorStats = result.contributors.map((id) => ({
    teammate: teammateById(id)!,
    count: result.citations.filter((c) => c.user === id).length,
  }));

  return (
    <div className="fade-up mt-5 flex flex-col gap-5">
      {/* Attribution cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {contributorStats.map(({ teammate: t, count }) => (
          <div key={t.id} className="card card-hover flex items-center gap-3 p-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
              style={{ background: ACCENTS[t.accent] }}
            >
              {t.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{t.name}</p>
              <p className="text-[11px] text-ink-faint">
                {count} contributing {count === 1 ? "concept" : "concepts"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Synthesized answer */}
      <div className="card p-5 sm:p-6">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          <IconSpark width={14} height={14} className="text-lavender" /> Synthesized answer
        </p>
        <p className="text-[15px] leading-7 text-ink">
          {result.answer.map((seg, i) =>
            seg.cite ? (
              <mark key={i} className="cite">
                {seg.text}
                <sup className="ml-0.5 text-[10px] font-bold text-lavender">{seg.cite}</sup>
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Citations */}
        <div className="card p-5">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Citations
          </p>
          <div className="flex flex-col gap-2.5">
            {result.citations.map((c) => {
              const t = teammateById(c.user)!;
              return (
                <div key={c.id} className="flex gap-3 rounded-xl border border-line p-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lemon/30 text-xs font-bold text-ink">
                    {c.id}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{c.concept}</p>
                      <span
                        className="chip shrink-0 text-[10px] text-white"
                        style={{ background: ACCENTS[t.accent] }}
                      >
                        {t.name.split(" ")[0]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">{c.snippet}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">via {c.app}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contributing subgraph */}
        <div className="card relative overflow-hidden p-5">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
            Contributing subgraph
          </p>
          <p className="mb-2 text-xs text-ink-soft">
            The {subNodes.length} nodes behind this answer.
          </p>
          <div
            className="h-[260px] w-full overflow-hidden rounded-xl bg-surface-2/60"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, rgba(157,123,255,0.10) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          >
            <GraphCanvas nodes={subNodes} links={subLinks} highlightIds={highlight} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {(Object.keys(EDGE_META) as Array<keyof typeof EDGE_META>).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span className="h-0.5 w-4 rounded-full" style={{ background: EDGE_META[k].color }} />
                {EDGE_META[k].label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
