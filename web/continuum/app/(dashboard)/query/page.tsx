"use client";

// Ask-the-mesh. Posts to the `query-synthesize` Edge Function (which the
// browser client authorizes with the current session JWT), then renders the
// citation-aware answer + the contributing subgraph it returns.
import { useMemo, useRef, useState } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import { useCluster } from "@/components/cluster";
import { getSupabase } from "@/lib/supabase/client";
import { EDGE_META, accentForUser } from "@/lib/ui";
import type { GraphLink, GraphNode, QueryResult } from "@/types/graph";
import { IconSend, IconMic } from "@/components/icons";

type Status = "idle" | "thinking" | "answered" | "error";

const SUGGESTED = [
  "Who's working on attention numerical stability?",
  "Has anyone hit this Supabase RLS issue before?",
  "What do we know about pgvector index tuning?",
  "Any conflicting findings worth reconciling?",
];

// Split prose into plain text + [Name@HH:MM] citation chunks.
function renderAnswer(text: string) {
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <mark key={i} className="cite">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function QueryPage() {
  const { active } = useCluster();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function ask(q?: string) {
    const text = (q ?? query).trim();
    if (!text || !active) return;
    setQuery(text);
    setStatus("thinking");
    setResult(null);
    setError(null);
    const { data, error } = await getSupabase().functions.invoke("query-synthesize", {
      body: { query: text, cluster_id: active.id },
    });
    if (error) {
      setError(error.message || "Something went wrong synthesizing an answer.");
      setStatus("error");
      return;
    }
    setResult(data as QueryResult);
    setStatus("answered");
  }

  // Push-to-talk: record a clip, transcribe it via `voice-transcribe`, then ask.
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
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        setStatus("thinking");
        const { data, error } = await getSupabase().functions.invoke("voice-transcribe", {
          body: blob,
          headers: { "Content-Type": mime },
        });
        const transcript = (data as { transcript?: string } | null)?.transcript?.trim();
        if (error || !transcript) {
          setError(error?.message || "Couldn't transcribe that — try again.");
          setStatus("error");
          return;
        }
        await ask(transcript);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Microphone unavailable — check browser permissions.");
      setStatus("error");
    }
  }

  function toggleMic() {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
    } else {
      startRecording();
    }
  }

  if (!active) return <NoCluster />;

  return (
    <div className="mx-auto max-w-3xl px-5 py-9 pb-24 sm:px-8 md:pb-12">
      <header className="fade-up">
        <p className="eyebrow">Cross-person recall</p>
        <h1 className="font-display mt-3 text-[2.4rem] leading-[1.05] sm:text-5xl">
          Ask the <span className="italic text-brand">mesh.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          One question, everyone&apos;s work. Answers come back synthesized and cited to the
          teammate who surfaced each idea.
        </p>
      </header>

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
                ? "bg-[var(--edge-contradicts)] text-[#0b0e1a]"
                : "bg-surface-2 text-ink-soft hover:text-ink"
            }`}
          >
            <IconMic width={18} height={18} />
          </button>
          <button
            onClick={() => ask()}
            disabled={status === "thinking" || !query.trim()}
            className="btn-grad grid h-10 w-10 shrink-0 place-items-center disabled:opacity-40"
          >
            <IconSend width={18} height={18} />
          </button>
        </div>
      </div>

      {recording && (
        <p className="fade-up mt-2.5 flex items-center gap-2 px-1 eyebrow">
          <span className="signal-dot" />
          Listening… tap the mic again to transcribe and ask
        </p>
      )}

      {status === "idle" && !recording && (
        <div className="fade-up mt-6" style={{ animationDelay: "120ms" }}>
          <p className="eyebrow mb-3">Try asking</p>
          <div className="flex flex-col gap-2">
            {SUGGESTED.map((q) => (
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

      {status === "thinking" && (
        <div className="card fade-up mt-6 p-6">
          <p className="eyebrow mb-4 flex items-center gap-2">
            <span className="signal-dot" />
            Synthesizing across the team graph
          </p>
          <div className="flex flex-col gap-3">
            <div className="shimmer h-3 w-full rounded-full" />
            <div className="shimmer h-3 w-[92%] rounded-full" />
            <div className="shimmer h-3 w-[78%] rounded-full" />
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="card fade-up mt-6 p-6">
          <p className="eyebrow mb-2 text-[var(--edge-contradicts)]">Couldn&apos;t answer</p>
          <p className="text-[14px] text-ink-soft">{error}</p>
          <button onClick={() => ask()} className="eyebrow mt-4 text-brand hover:text-ink">
            try again
          </button>
        </div>
      )}

      {status === "answered" && result && <Answer result={result} />}
    </div>
  );
}

function Answer({ result }: { result: QueryResult }) {
  const { subNodes, subLinks, highlight } = useMemo(() => {
    const subNodes: GraphNode[] = result.subgraph.nodes.map((n) => ({
      id: n.id,
      label: n.concept || n.label || "node",
      app: n.app || "",
      teammate: n.teammate || "",
      colorKey: n.teammate || n.id,
    }));
    const subLinks: GraphLink[] = result.subgraph.edges.map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
    }));
    return { subNodes, subLinks, highlight: new Set(subNodes.map((n) => n.id)) };
  }, [result]);

  return (
    <div className="fade-up mt-7 flex flex-col gap-6">
      <div className="card p-6 sm:p-7">
        <p className="eyebrow mb-4">Synthesized answer</p>
        <p className="font-display text-[1.2rem] leading-relaxed text-ink">{renderAnswer(result.answer)}</p>
      </div>

      {subNodes.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sources */}
          <div className="card p-6">
            <p className="eyebrow mb-4">Sources · {subNodes.length}</p>
            <div className="flex flex-col gap-2.5">
              {subNodes.map((n) => (
                <div key={n.id} className="flex gap-3 rounded-[10px] border border-line p-3">
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: accentForUser(n.colorKey) }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{n.label}</p>
                    <p className="eyebrow mt-1">
                      {n.teammate || "teammate"}
                      {n.app ? ` · ${n.app}` : ""}
                    </p>
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
                background: "var(--bg)",
                backgroundImage: "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
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

function NoCluster() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <div className="card p-7 text-center">
        <p className="eyebrow">No cluster</p>
        <h2 className="font-display mt-2 text-2xl">Join a workspace to ask the mesh</h2>
        <p className="mt-2 text-[13px] text-ink-soft">Redeem an invite link to get started.</p>
      </div>
    </div>
  );
}
