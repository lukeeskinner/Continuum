"use client";

// A small, live force-graph used as the overview hero visual — the thesis of
// the product ("watch the mesh build itself") rendered literally. Seeds a
// curated subset and weaves a couple more concepts in on a timer.
import { useCallback, useEffect, useRef, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import { buildGraphNodes, buildGraphLinks, STREAM_NODES } from "@/lib/mock";
import type { GraphLink, GraphNode } from "@/types/graph";

const SUBSET = new Set(["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n10", "n14", "n15", "n17"]);

export default function HeroMesh() {
  const [nodes, setNodes] = useState<GraphNode[]>(() =>
    buildGraphNodes().filter((n) => SUBSET.has(n.id)),
  );
  const [links, setLinks] = useState<GraphLink[]>(() =>
    buildGraphLinks().filter((l) => SUBSET.has(l.source) && SUBSET.has(l.target)),
  );
  const idx = useRef(0);

  const weave = useCallback(() => {
    const item = STREAM_NODES[idx.current % STREAM_NODES.length];
    idx.current += 1;
    const id = `${item.node.id}-h${idx.current}`;
    setNodes((prev) => [
      ...prev,
      { id, label: item.node.concept, app: item.node.app, teammate: item.node.user, colorKey: item.node.user },
    ]);
    if (item.link) {
      setLinks((prev) => [...prev, { source: id, target: item.link!.target, type: item.link!.type }]);
    }
  }, []);

  useEffect(() => {
    const t = setInterval(weave, 4200);
    return () => clearInterval(t);
  }, [weave]);

  return <GraphCanvas nodes={nodes} links={links} />;
}
