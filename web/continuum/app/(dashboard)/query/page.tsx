"use client";

// Ask-the-mesh. First recalls from the team graph (query-synthesize). Then, if
// the question looks like a bug OR the graph came back thin, it auto-fires the
// web-research agent (/api/research → Browserbase) and folds in what it finds —
// also adding those findings to the mesh as Browser nodes.
// Posts to the `query-synthesize` Edge Function (which the
// browser client authorizes with the current session JWT), then renders the
// citation-aware answer + the contributing subgraph it returns.
import { useMemo, useRef, useState } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import { useCluster } from "@/components/cluster";
import { getSupabase, getAccessToken } from "@/lib/supabase/client";
import { searchNodes } from "@/lib/queries";
import { EDGE_META, accentForUser, displayName } from "@/lib/ui";
import type { GraphLink, GraphNode, QueryResult } from "@/types/graph";
import { IconSend, IconMic } from "@/components/icons";

type Status = "idle" | "thinking" | "done" | "error";

interface ResearchFinding {
  title: string;
  url: string;
  snippet: string;
  node_id: string | null;
}
interface ResearchResp {
  available: boolean;
  source?: string;
  answer?: string;
  findings?: ResearchFinding[];
  added?: number;
  error?: string;
  reason?: string;
}

const SUGGESTED = [
  "Why is our softmax overflowing on long sequences?",
  "Has anyone hit this Supabase RLS recursion error?",
  "What do we know about pgvector index tuning?",
  "Any conflicting findings worth reconciling?",
];

const BUG_RE =
  /\b(bug|error|exception|traceback|stack ?trace|crash|fails?|failing|broken|undefined|null|segfault|panic|throw|cannot|can'?t|doesn'?t work|not working|why is|503|500|429|timeout)\b/i;

const SOURCE_LABEL: Record<string, string> = {
  "github-issues": "GitHub issues",
  "github-repos": "GitHub repos",
  web: "the web",
};

// Wrap [..] citation markers as highlights.
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
  const { active, members } = useCluster();
  const nameFor = (uid: string) => {
    const m = members.find((x) => x.user_id === uid);
    return m ? displayName(m.profiles) : "teammate";
  };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [research, setResearch] = useState<ResearchResp | null>(null);
  const [researching, setResearching] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function runResearch(text: string) {
    if (!active) return;
    setResearching(true);
    setResearch(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: text, cluster_id: active.id }),
      });
      if (res.status === 401) {
        setResearch({ available: true, error: "Your session expired — sign out and back in, then retry." });
      } else {
        setResearch((await res.json()) as ResearchResp);
      }
    } catch (e) {
      setResearch({ available: true, error: String(e), findings: [] });
    } finally {
      setResearching(false);
    }
  }

  async function ask(q?: string) {
    const text = (q ?? query).trim();
    if (!text || !active) return;
    setQuery(text);
    setStatus("thinking");
    setResult(null);
    setInternalError(null);
    setResearch(null);

    let thin = true;
    const { data, error } = await getSupabase().functions.invoke("query-synthesize", {
      body: { query: text, cluster_id: active.id },
    });
    if (error) {
      // query-synthesize isn't deployed → in-app keyword recall over the graph.
      try {
        const { nodes, edges } = await searchNodes(active.id, text);
        if (nodes.length > 0) {
          setResult({
            answer: `Found ${nodes.length} related ${nodes.length === 1 ? "concept" : "concepts"} across the team.`,
            subgraph: {
              nodes: nodes.map((n) => ({ id: n.id, concept: n.concept, app: n.app, teammate: nameFor(n.user_id) })),
              edges: edges.map((e) => ({ source: e.source_node_id, target: e.target_node_id, type: e.type })),
            },
          });
          thin = nodes.length < 2;
        } else {
          setInternalError("no team match");
        }
      } catch {
        setInternalError(error.message || "The team graph is unavailable right now.");
      }
    } else {
      const res = data as QueryResult;
      setResult(res);
      thin = (res.subgraph?.nodes?.length ?? 0) < 2;
      try {
        const token = await getAccessToken();
        const estimate = Math.round((text.length + (res.answer?.length ?? 0)) / 4) + 300;
        fetch("/api/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tokens: estimate }),
        }).catch(() => {});
      } catch {
        /* best-effort */
      }
    }
    setStatus("done");

    // Auto-fire web research when it's a bug-like question or the graph is thin.
    if (BUG_RE.test(text) || thin) await runResearch(text);
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
        <p className="eyebrow">Cross-person recall · web research</p>
        <h1 className="font-display mt-3 text-[2.4rem] leading-[1.05] sm:text-5xl">
          Ask the <span className="italic text-brand">mesh.</span>
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          First it recalls from everyone&apos;s work. If it&apos;s a bug or the team hasn&apos;t
          seen it, the agent browses the web (GitHub, docs) and folds the findings back in.
        </p>
      </header>

      <div className="card fade-up mt-7 p-2" style={{ animationDelay: "60ms" }}>
        <div className="flex items-center gap-2">
          <span className="ml-2.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Why is our softmax overflowing on long sequences?"
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
            Recalling across the team graph
          </p>
          <div className="flex flex-col gap-3">
            <div className="shimmer h-3 w-full rounded-full" />
            <div className="shimmer h-3 w-[92%] rounded-full" />
            <div className="shimmer h-3 w-[78%] rounded-full" />
          </div>
        </div>
      )}

      {status === "done" && (
        <div className="mt-7 flex flex-col gap-6">
          {result ? (
            <Answer result={result} />
          ) : (
            <div className="card fade-up p-6">
              <p className="eyebrow mb-2">Team graph</p>
              <p className="text-[14px] text-ink-soft">
                {internalError ? "Nothing from the team graph — checking the web instead." : "No internal match."}
              </p>
            </div>
          )}

          {/* manual trigger if research didn't auto-run */}
          {!researching && !research && (
            <button
              onClick={() => runResearch(query)}
              className="card card-hover self-start px-4 py-2.5 text-[13px] font-medium text-ink"
            >
              Search the web too →
            </button>
          )}

          {researching && (
            <div className="card fade-up p-6">
              <p className="eyebrow mb-4 flex items-center gap-2">
                <span className="signal-dot" /> Browsing the web for this
              </p>
              <div className="flex flex-col gap-3">
                <div className="shimmer h-3 w-full rounded-full" />
                <div className="shimmer h-3 w-[85%] rounded-full" />
              </div>
            </div>
          )}

          {research && <ResearchPanel research={research} />}
        </div>
      )}
    </div>
  );
}

function ResearchPanel({ research }: { research: ResearchResp }) {
  if (!research.available) {
    return (
      <div className="card fade-up p-6">
        <p className="eyebrow mb-2">Web research is off</p>
        <p className="text-[13px] text-ink-soft">
          Add <span className="tnum text-ink">BROWSERBASE_API_KEY</span>,{" "}
          <span className="tnum text-ink">BROWSERBASE_PROJECT_ID</span> and{" "}
          <span className="tnum text-ink">ANTHROPIC_API_KEY</span> to enable browsing.
        </p>
      </div>
    );
  }
  const findings = research.findings ?? [];
  return (
    <div className="card fade-up p-6 sm:p-7">
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">From {SOURCE_LABEL[research.source ?? "web"] ?? "the web"}</p>
        {!!research.added && <span className="eyebrow text-brand">{research.added} added to mesh</span>}
      </div>

      {research.error ? (
        <p className="text-[14px] text-ink-soft">{research.error}</p>
      ) : (
        <p className="font-display text-[1.2rem] leading-relaxed text-ink">
          {renderAnswer(research.answer ?? "")}
        </p>
      )}

      {findings.length > 0 && (
        <div className="mt-5 flex flex-col gap-2.5">
          {findings.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="card card-hover flex gap-3 rounded-[10px] p-3"
            >
              <span className="tnum mt-0.5 text-[12px] text-brand">[{i + 1}]</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{f.title}</p>
                <p className="truncate text-[12px] text-ink-soft">{f.snippet}</p>
                <p className="eyebrow mt-1 flex items-center gap-2">
                  {(() => {
                    try {
                      return new URL(f.url).hostname.replace(/^www\./, "");
                    } catch {
                      return "link";
                    }
                  })()}
                  {f.node_id && <span className="text-mint">· in mesh</span>}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
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
    <div className="fade-up flex flex-col gap-6">
      <div className="card p-6 sm:p-7">
        <p className="eyebrow mb-4">From your team</p>
        <p className="font-display text-[1.2rem] leading-relaxed text-ink">{renderAnswer(result.answer)}</p>
      </div>

      {subNodes.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
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
