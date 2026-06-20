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
import { IconChat, IconMic, IconSend, IconBolt, IconSpark } from "@/components/icons";

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
          Listening… tap the mic again to transcribe and ask
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
            Synthesizing across the team&apos;s graph…
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="shimmer h-3.5 w-full rounded-full" />
            <div className="shimmer h-3.5 w-[92%] rounded-full" />
            <div className="shimmer h-3.5 w-[78%] rounded-full" />
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
    <div className="fade-up mt-5 flex flex-col gap-5">
      {/* Attribution cards */}
      {contributors.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {contributors.map(({ name, count }) => (
            <div key={name} className="card card-hover flex items-center gap-3 p-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: colorForKey(name) }}
              >
                {initialsFor(name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{name}</p>
                <p className="text-[11px] text-ink-faint">
                  {count} contributing {count === 1 ? "concept" : "concepts"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Synthesized answer */}
      <div className="card p-5 sm:p-6">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          <IconSpark width={14} height={14} className="text-lavender" /> Synthesized answer
        </p>
        <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">{result.answer}</p>
      </div>

      {hasNodes && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Citations */}
          <div className="card p-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              Citations
            </p>
            <div className="flex flex-col gap-2.5">
              {citations.map((c, i) => (
                <div key={c.id} className="flex gap-3 rounded-xl border border-line p-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lemon/30 text-xs font-bold text-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{c.concept}</p>
                      <span
                        className="chip shrink-0 text-[10px] text-white"
                        style={{ background: colorForKey(c.teammate) }}
                      >
                        {c.teammate.split(" ")[0]}
                      </span>
                    </div>
                    {(c.app || c.topic) && (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {[c.app, c.topic].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
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
      )}
    </div>
  );
}
