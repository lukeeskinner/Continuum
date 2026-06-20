"use client";

// Chat-style query sidebar. Users type or speak a question; the component posts
// to `query-synthesize` (with the caller's JWT) and renders the citation-aware
// answer. Voice capture records audio and routes it through `voice-transcribe`.
import { useRef, useState } from "react";
import { callFunction, callFunctionRaw } from "@/lib/functions";
import type { QueryResult } from "@/types/graph";

interface Props {
  clusterId: string;
  onHighlight?: (nodeIds: string[]) => void;
}

interface TranscribeResult {
  transcript: string;
}

export default function QuerySidebar({ clusterId, onHighlight }: Props) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function ask(text?: string) {
    const q = (text ?? query).trim();
    if (!q) return;
    setLoading(true);
    setAnswer("");
    setResult(null);
    try {
      const data = await callFunction<QueryResult>("query-synthesize", {
        query: q,
        cluster_id: clusterId,
      });
      setAnswer(data.answer ?? "No answer.");
      setResult(data);
      onHighlight?.((data.subgraph?.nodes ?? []).map((n) => n.id));
    } catch (err) {
      setAnswer(`Error: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setLoading(false);
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
        setLoading(true);
        try {
          const { transcript } = await callFunctionRaw<TranscribeResult>(
            "voice-transcribe",
            blob,
            recorder.mimeType || "audio/webm",
          );
          if (transcript) {
            setQuery(transcript);
            await ask(transcript);
          } else {
            setAnswer("Could not transcribe audio.");
          }
        } catch (err) {
          setAnswer(`Transcription error: ${String(err)}`);
        } finally {
          setLoading(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      setAnswer(`Microphone error: ${String(err)}`);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <aside className="flex h-full w-80 flex-col border-l border-zinc-800 bg-zinc-950 p-4 text-zinc-100">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Ask the team graph
      </h2>

      <div className="flex-1 space-y-3 overflow-y-auto">
        <div className="rounded-md bg-zinc-900 p-3 text-sm leading-6">
          {loading
            ? "Synthesizing…"
            : answer || "Ask a question to query across everyone's work."}
        </div>

        {result && result.subgraph?.nodes?.length > 0 && (
          <div className="rounded-md border border-zinc-800 p-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
              Sources
            </p>
            <ul className="space-y-1 text-xs text-zinc-300">
              {result.subgraph.nodes.map((n) => (
                <li key={n.id} className="truncate">
                  • {n.label ?? n.concept ?? n.id}
                  {n.teammate ? ` — ${n.teammate}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
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
          onClick={recording ? stopRecording : startRecording}
          title={recording ? "Stop recording" : "Speak a question"}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            recording
              ? "bg-red-600 hover:bg-red-500"
              : "border border-zinc-700 hover:bg-zinc-900"
          }`}
        >
          {recording ? "■" : "🎤"}
        </button>
        <button
          onClick={() => ask()}
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          Ask
        </button>
      </div>
    </aside>
  );
}
