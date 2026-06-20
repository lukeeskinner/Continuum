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
import { IconMic, IconSend } from "@/components/icons";

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
      ask(SUGGESTED_QUERIES[0]);
    }, 1900);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-9 pb-24 sm:px-8 md:pb-12">
      <header className="fade-up">
        <p className="eyebrow">Cross-person recall</p>
        <h1 className="font-display mt-3 text-[2.4rem] leading-[1.05] sm:text-5xl">
          Ask the <span className="italic text-brand">mesh.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          One question, everyone&apos;s work. Answers come back synthesized, cited, and attributed
          to whoever surfaced each idea.
        </p>
      </header>

      {/* Input */}
      <div className="card fade-up mt-7 p-2" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-2">
          <span className="ml-2.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Who's working on attention numerical stability?"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={toggleMic}
            title="Push to talk"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] transition ${
              recording
                ? "rec-pulse bg-[var(--edge-contradicts)] text-[#0b0e1a]"
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
            className="btn-grad grid h-10 w-10 shrink-0 place-items-center disabled:opacity-50"
          >
            <IconSend width={18} height={18} />
          </button>
        </div>
      </div>

      {recording && (
        <p className="fade-up mt-2.5 flex items-center gap-2 px-1 eyebrow">
          <span className="rec-pulse h-2 w-2 rounded-full bg-[var(--edge-contradicts)]" />
          Listening — release to transcribe with Deepgram
        </p>
      )}

      {/* Suggested */}
      {status === "idle" && !recording && (
        <div className="fade-up mt-6" style={{ animationDelay: "120ms" }}>
          <p className="eyebrow mb-3">Try asking</p>
          <div className="flex flex-col gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                className="card card-hover group flex items-center gap-3 px-4 py-3 text-left text-[14px] text-ink-soft"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint transition-colors group-hover:bg-brand" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thinking */}
      {status === "thinking" && (
        <div className="card fade-up mt-6 p-6">
          <p className="eyebrow mb-4 flex items-center gap-2">
            <span className="signal-dot" />
            Synthesizing across {TEAMMATES.length} teammates&apos; graphs
          </p>
          <div className="flex flex-col gap-3">
            <div className="shimmer h-3 w-full rounded-full" />
            <div className="shimmer h-3 w-[92%] rounded-full" />
            <div className="shimmer h-3 w-[78%] rounded-full" />
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
    <div className="fade-up mt-7 flex flex-col gap-6">
      {/* Synthesized answer — the mesh "speaks", set in the serif */}
      <div className="card p-6 sm:p-7">
        <p className="eyebrow mb-4">Synthesized answer</p>
        <p className="font-display text-[1.2rem] leading-relaxed text-ink">
          {result.answer.map((seg, i) =>
            seg.cite ? (
              <mark key={i} className="cite">
                {seg.text}
                <sup className="tnum ml-0.5 align-super text-[10px] text-signal">{seg.cite}</sup>
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>

        {/* attribution — who this came from */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
          <span className="eyebrow">drawn from</span>
          {contributorStats.map(({ teammate: t, count }) => (
            <div key={t.id} className="flex items-center gap-2.5">
              <span
                className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-semibold text-[#0b0e1a]"
                style={{ background: ACCENTS[t.accent] }}
              >
                {t.initials}
              </span>
              <div className="leading-tight">
                <p className="text-[13px] font-medium">{t.name}</p>
                <p className="eyebrow mt-0.5">
                  {count} {count === 1 ? "concept" : "concepts"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Citations */}
        <div className="card p-6">
          <p className="eyebrow mb-4">Citations</p>
          <div className="flex flex-col gap-2.5">
            {result.citations.map((c) => {
              const t = teammateById(c.user)!;
              return (
                <div key={c.id} className="flex gap-3 rounded-[10px] border border-line p-3">
                  <span
                    className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--signal) 16%, transparent)",
                      color: "var(--signal)",
                    }}
                  >
                    {c.id}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-medium">{c.concept}</p>
                      <span className="flex shrink-0 items-center gap-1.5 eyebrow">
                        <span className="h-2 w-2 rounded-full" style={{ background: ACCENTS[t.accent] }} />
                        {t.name.split(" ")[0]}
                      </span>
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-soft">{c.snippet}</p>
                    <p className="eyebrow mt-1.5">via {c.app}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contributing subgraph */}
        <div className="card overflow-hidden p-6">
          <p className="eyebrow">Contributing subgraph</p>
          <p className="mb-3 mt-1 text-[12.5px] text-ink-soft">
            The {subNodes.length} concepts behind this answer.
          </p>
          <div
            className="h-[260px] w-full overflow-hidden rounded-[10px] border border-line"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          >
            <GraphCanvas nodes={subNodes} links={subLinks} highlightIds={highlight} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {(Object.keys(EDGE_META) as Array<keyof typeof EDGE_META>).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-[12px] text-ink-soft">
                <span className="h-[2px] w-4 rounded-full" style={{ background: EDGE_META[k].color }} />
                {EDGE_META[k].label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
