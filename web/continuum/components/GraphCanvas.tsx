"use client";

// D3 force-directed graph. Nodes are color-coded per teammate (pastel),
// edges are colored by relationship type (RELATED_TO / BUILDS_ON / CONTRADICTS).
// The simulation persists across renders so newly streamed nodes/edges
// animate in (pop + spring) without resetting existing positions.
import { useEffect, useRef } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { drag } from "d3-drag";
import "d3-transition";
import type { EdgeType, GraphLink, GraphNode } from "@/types/graph";
import { EDGE_META } from "@/lib/mock";
import { colorForKey } from "@/lib/colors";

type SimNode = GraphNode & SimulationNodeDatum & { deg?: number };
type SimLink = { source: SimNode; target: SimNode; type: EdgeType };

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (node: GraphNode) => void;
  highlightIds?: Set<string>; // optional subgraph emphasis
}

export default function GraphCanvas({ nodes, links, onNodeClick, highlightIds }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const initRef = useRef(false);
  const clickRef = useRef(onNodeClick);
  useEffect(() => {
    clickRef.current = onNodeClick;
  }, [onNodeClick]);

  // One-time scaffold: root groups + simulation.
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || initRef.current) return;
    initRef.current = true;

    const svg = select(svgEl);
    svg.append("g").attr("class", "links");
    svg.append("g").attr("class", "nodes");

    const sim = forceSimulation<SimNode, SimLink>([])
      .force("link", forceLink<SimNode, SimLink>([]).id((d) => d.id).distance(95).strength(0.5))
      .force("charge", forceManyBody().strength(-340))
      .force("collide", forceCollide<SimNode>().radius((d) => 14 + (d.deg ?? 0) * 1.6))
      .force("x", forceX(0).strength(0.05))
      .force("y", forceY(0).strength(0.05));
    simRef.current = sim;

    const resize = () => {
      const w = svgEl.clientWidth || 800;
      const h = svgEl.clientHeight || 600;
      sim.force("center", forceCenter(w / 2, h / 2));
      sim.alpha(0.3).restart();
    };
    resize();
    window.addEventListener("resize", resize);

    sim.on("tick", () => {
      svg
        .select("g.links")
        .selectAll<SVGLineElement, SimLink>("line")
        .attr("x1", (d) => d.source.x ?? 0)
        .attr("y1", (d) => d.source.y ?? 0)
        .attr("x2", (d) => d.target.x ?? 0)
        .attr("y2", (d) => d.target.y ?? 0);
      svg
        .select("g.nodes")
        .selectAll<SVGGElement, SimNode>("g.node")
        .attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      window.removeEventListener("resize", resize);
      sim.stop();
    };
  }, []);

  // Data updates: merge nodes/links into the live simulation + animate.
  useEffect(() => {
    const svgEl = svgRef.current;
    const sim = simRef.current;
    if (!svgEl || !sim) return;
    const svg = select(svgEl);
    const w = svgEl.clientWidth || 800;
    const h = svgEl.clientHeight || 600;

    // Merge node data, preserving positions for existing nodes.
    const map = nodeMapRef.current;
    const next = new Set(nodes.map((n) => n.id));
    for (const id of [...map.keys()]) if (!next.has(id)) map.delete(id);
    const simNodes: SimNode[] = nodes.map((n) => {
      const existing = map.get(n.id);
      if (existing) {
        Object.assign(existing, n);
        return existing;
      }
      const created: SimNode = {
        ...n,
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: h / 2 + (Math.random() - 0.5) * 60,
      };
      map.set(n.id, created);
      return created;
    });

    const byId = map;
    const simLinks: SimLink[] = links
      .filter((l) => byId.has(l.source) && byId.has(l.target))
      .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)!, type: l.type }));

    // Degree (for sizing hubs).
    const deg = new Map<string, number>();
    for (const l of simLinks) {
      deg.set(l.source.id, (deg.get(l.source.id) ?? 0) + 1);
      deg.set(l.target.id, (deg.get(l.target.id) ?? 0) + 1);
    }
    simNodes.forEach((n) => (n.deg = deg.get(n.id) ?? 0));
    const radius = (d: SimNode) => 8 + Math.min(d.deg ?? 0, 6) * 1.7;

    // Neighbor lookup for hover highlighting.
    const neighbors = new Map<string, Set<string>>();
    simLinks.forEach((l) => {
      (neighbors.get(l.source.id) ?? neighbors.set(l.source.id, new Set()).get(l.source.id)!).add(l.target.id);
      (neighbors.get(l.target.id) ?? neighbors.set(l.target.id, new Set()).get(l.target.id)!).add(l.source.id);
    });

    // --- LINKS join ---
    const linkSel = svg
      .select("g.links")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(simLinks, (d) => `${d.source.id}->${d.target.id}`);
    linkSel.exit().transition().duration(250).attr("stroke-opacity", 0).remove();
    const linkEnter = linkSel
      .enter()
      .append("line")
      .attr("stroke", (d) => EDGE_META[d.type].color)
      .attr("stroke-width", (d) => (d.type === "CONTRADICTS" ? 2.4 : 1.8))
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", (d) => (d.type === "CONTRADICTS" ? "1 6" : null))
      .attr("stroke-opacity", 0);
    linkEnter.transition().duration(600).attr("stroke-opacity", 0.55);
    const allLinks = linkEnter.merge(linkSel);
    allLinks.attr("stroke", (d) => EDGE_META[d.type].color);

    // --- NODES join ---
    const nodeSel = svg
      .select("g.nodes")
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(simNodes, (d) => d.id);
    nodeSel.exit().transition().duration(250).attr("opacity", 0).remove();

    const nodeEnter = nodeSel
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .attr("opacity", 0)
      .on("click", (_e, d) => clickRef.current?.(d))
      .on("mouseenter", function (_e, d) {
        const keep = new Set<string>([d.id, ...(neighbors.get(d.id) ?? [])]);
        svg.select("g.nodes").selectAll<SVGGElement, SimNode>("g.node")
          .transition().duration(150)
          .attr("opacity", (n) => (keep.has(n.id) ? 1 : 0.18));
        allLinks.transition().duration(150)
          .attr("stroke-opacity", (l) => (l.source.id === d.id || l.target.id === d.id ? 0.95 : 0.06));
      })
      .on("mouseleave", function () {
        svg.select("g.nodes").selectAll<SVGGElement, SimNode>("g.node")
          .transition().duration(200).attr("opacity", 1);
        allLinks.transition().duration(200).attr("stroke-opacity", 0.55);
      });

    // glow halo
    nodeEnter
      .append("circle")
      .attr("class", "halo")
      .attr("fill", (d) => colorForKey(d.colorKey))
      .attr("opacity", 0.22);
    // core
    nodeEnter
      .append("circle")
      .attr("class", "core")
      .attr("fill", (d) => colorForKey(d.colorKey))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2.5);
    // label
    nodeEnter
      .append("text")
      .attr("class", "label")
      .attr("text-anchor", "middle")
      .attr("fill", "#54506b")
      .attr("font-size", 10.5)
      .attr("font-weight", 600)
      .attr("paint-order", "stroke")
      .attr("stroke", "#fbf8ff")
      .attr("stroke-width", 3)
      .text((d) => (d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label));

    nodeEnter.append("title").text((d) => `${d.label}`);

    // pop the new nodes in
    nodeEnter.transition().duration(500).attr("opacity", 1);
    nodeEnter
      .select<SVGCircleElement>("circle.core")
      .attr("r", 0)
      .transition()
      .duration(550)
      .ease((t) => 1 - Math.pow(1 - t, 3))
      .attr("r", (d) => radius(d));

    const allNodes = nodeEnter.merge(nodeSel);
    // keep sizes / labels fresh on every update
    allNodes.select<SVGCircleElement>("circle.core").transition().duration(300).attr("r", (d) => radius(d));
    allNodes.select<SVGCircleElement>("circle.halo").attr("r", (d) => radius(d) + 7);
    allNodes.select<SVGTextElement>("text.label").attr("dy", (d) => radius(d) + 14);

    // subgraph emphasis (used by the query subgraph view)
    if (highlightIds && highlightIds.size > 0) {
      allNodes.transition().duration(300).attr("opacity", (d) => (highlightIds.has(d.id) ? 1 : 0.12));
    } else {
      allNodes.attr("opacity", 1);
    }

    // drag behavior
    allNodes.call(
      drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    // feed data into the simulation
    sim.nodes(simNodes);
    (sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>).links(simLinks);
    sim.alpha(0.7).restart();
  }, [nodes, links, highlightIds]);

  return <svg ref={svgRef} className="h-full w-full select-none" />;
}
