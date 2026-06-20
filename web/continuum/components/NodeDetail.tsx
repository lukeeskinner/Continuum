"use client";

// Detail panel shown when a node is clicked: teammate, app, topic, concept,
// optional error type, and the capture timestamp.
import type { GraphNode } from "@/types/graph";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function NodeDetail({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-20 w-80 rounded-lg border border-zinc-800 bg-zinc-950/95 p-4 text-sm shadow-xl backdrop-blur">
      <div className="mb-2 flex items-start justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Node detail
        </span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <p className="mb-3 font-medium text-zinc-100">{node.label}</p>

      <dl className="space-y-1.5 text-xs">
        <Row k="Teammate" v={node.teammate} />
        <Row k="App" v={node.app} />
        <Row k="Topic" v={node.topic || "—"} />
        {node.errorType && <Row k="Error" v={node.errorType} />}
        <Row k="Captured" v={formatTime(node.createdAt)} />
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-right text-zinc-200">{v}</dd>
    </div>
  );
}
