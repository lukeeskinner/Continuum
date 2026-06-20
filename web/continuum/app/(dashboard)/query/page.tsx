"use client";

// Ask-the-mesh query interface. Text input + push-to-talk voice capture route
// to the real Edge Functions: voice -> `voice-transcribe`, query ->
// `query-synthesize`. Renders the synthesized answer with teammate attribution
// cards, a citation list, and the contributing subgraph.
import { useMemo, useRef, useState } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import { useCluster } from "@/components/ClusterProvider";
import { callFunction, callFunctionRaw } from "@/lib/functions";
import { colorForKey, initialsFor } from "@/lib/colors";
import { EDGE_META } from "@/lib/mock";
import type { GraphLink, GraphNode, QueryResult } from "@/types/graph";
import { IconMic, IconSend } from "@/components/icons";

type Status = "idle" | "thinking" | "answered" | "error";

const SUGGESTED_QUERIES = [
  "What is the team working on right now?",
  "Has anyone run into this error before?",
  "Who knows the most about our auth setup?",
  "Summarize recent work across the team.",
];

interface TranscribeResult {
  transcript: string;
}

export default function QueryPage() {
  const { activeClusterId } = useCluster();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function ask(q?: string) {
    const text = (q ?? query).trim();
    if (!text || !activeClusterId) return;
    setQuery(text);
    setStatus("thinking");
    setResult(null);
    setError("");
    try {
      const data = await callFunction<QueryResult>("query-synthesize", {
        query: text,
        cluster_id: activeClusterId,
      });
      setResult(data);
      setStatus("answered");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setStatus("error");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setStatus("thinking");
        try {
          const { transcript } = await callFunctionRaw<TranscribeResult>(
            "voice-transcribe",
            blob,
            recorder.mimeType || "audio/webm",
          );
          if (transcript) {
            await ask(transcript);
          } else {
            setError("Could not transcribe audio.");
            setStatus("error");
          }
        } catch (err) {
          setError(`Transcription error: ${String(err instanceof Error ? err.message : err)}`);
          setStatus("error");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      setError(`Microphone error: ${String(err instanceof Error ? err.message : err)}`);
      setStatus("error");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function toggleMic() {
    if (recording) stopRecording();
    else startRecording();
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
          Listening… tap the mic again to transcribe and ask
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
            Synthesizing across the team&apos;s graph…
          </p>
          <div className="flex flex-col gap-3">
            <div className="shimmer h-3 w-full rounded-full" />
            <div className="shimmer h-3 w-[92%] rounded-full" />
            <div className="shimmer h-3 w-[78%] rounded-full" />
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="card fade-up mt-5 border border-[var(--edge-contradicts)]/40 p-5">
          <p className="text-sm font-semibold text-ink">Something went wrong</p>
          <p className="mt-1 text-xs text-ink-soft">{error}</p>
        </div>
      )}

      {/* Answer */}
      {status === "answered" && result && <Answer result={result} />}
    </div>
  );
}

function Answer({ result }: { result: QueryResult }) {
  const { subNodes, subLinks, highlight, citations, contributors } = useMemo(() => {
    const subNodes: GraphNode[] = result.subgraph.nodes.map((n) => ({
      id: n.id,
      label: n.label || n.concept || n.id,
      app: n.app || "",
      teammate: n.teammate || "",
      colorKey: n.teammate || n.id,
    }));
    const subLinks: GraphLink[] = result.subgraph.edges
      .map((e) => ({
        source: e.source ?? e.source_node_id ?? "",
        target: e.target ?? e.target_node_id ?? "",
        type: e.type,
      }))
      .filter((l) => l.source && l.target);
    const highlight = new Set(subNodes.map((n) => n.id));

    const citations = result.subgraph.nodes.map((n) => ({
      id: n.id,
      concept: n.label || n.concept || "Concept",
      teammate: n.teammate || "Unknown",
      app: n.app || "",
      topic: n.topic || "",
    }));

    const counts = new Map<string, number>();
    for (const c of citations) counts.set(c.teammate, (counts.get(c.teammate) ?? 0) + 1);
    const contributors = [...counts.entries()].map(([name, count]) => ({ name, count }));

    return { subNodes, subLinks, highlight, citations, contributors };
  }, [result]);

  const hasNodes = subNodes.length > 0;

  return (
    <div className="fade-up mt-7 flex flex-col gap-6">
      {/* Synthesized answer — the mesh "speaks", set in the serif */}
      <div className="card p-6 sm:p-7">
        <p className="eyebrow mb-4">Synthesized answer</p>
        <p className="whitespace-pre-wrap font-display text-[1.2rem] leading-relaxed text-ink">
          {result.answer}
        </p>

        {/* attribution — who this came from */}
        {contributors.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
            <span className="eyebrow">drawn from</span>
            {contributors.map(({ name, count }) => (
              <div key={name} className="flex items-center gap-2.5">
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: colorForKey(name) }}
                >
                  {initialsFor(name)}
                </span>
                <div className="leading-tight">
                  <p className="text-[13px] font-medium">{name}</p>
                  <p className="eyebrow mt-0.5">
                    {count} {count === 1 ? "concept" : "concepts"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasNodes && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Citations */}
          <div className="card p-6">
            <p className="eyebrow mb-4">Citations</p>
            <div className="flex flex-col gap-2.5">
              {citations.map((c, i) => (
                <div key={c.id} className="flex gap-3 rounded-[10px] border border-line p-3">
                  <span
                    className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--signal) 16%, transparent)",
                      color: "var(--signal)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-medium">{c.concept}</p>
                      <span className="flex shrink-0 items-center gap-1.5 eyebrow">
                        <span className="h-2 w-2 rounded-full" style={{ background: colorForKey(c.teammate) }} />
                        {c.teammate.split(" ")[0]}
                      </span>
                    </div>
                    {c.topic && <p className="mt-1 text-[12.5px] text-ink-soft">{c.topic}</p>}
                    <p className="eyebrow mt-1.5">via {c.app}</p>
                  </div>
                </div>
              ))}
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
      )}
    </div>
  );
}
