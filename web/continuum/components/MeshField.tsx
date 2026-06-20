// Ambient constellation substrate rendered behind the whole app.
// Deterministic (seeded) so server + client markup match — no hydration drift.
// Kept deliberately faint; it establishes the "inside the mesh" identity
// without competing with content. Drift is disabled under reduced-motion.

const SPECTRUM = [
  "var(--lavender)",
  "var(--pink)",
  "var(--sky)",
  "var(--mint)",
  "var(--peach)",
  "var(--lemon)",
];

const W = 1440;
const H = 900;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = { x: number; y: number; r: number; c: string };

const rand = mulberry32(73);
const NODES: P[] = Array.from({ length: 34 }, (_, i) => ({
  x: 60 + rand() * (W - 120),
  y: 60 + rand() * (H - 120),
  r: 1.4 + rand() * 2.6,
  c: SPECTRUM[i % SPECTRUM.length],
}));

// Connect each node to its nearest couple of neighbours -> sparse web.
const LINKS: Array<{ a: P; b: P }> = [];
NODES.forEach((n, i) => {
  const others = NODES.map((m, j) => ({ m, j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
    .filter((o) => o.j !== i)
    .sort((p, q) => p.d - q.d)
    .slice(0, 2);
  others.forEach(({ m, j }) => {
    if (j > i) LINKS.push({ a: n, b: m });
  });
});

export default function MeshField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(circle, rgba(142,123,240,0.05) 1px, transparent 1px)",
        backgroundSize: "30px 30px",
      }}
    >
      <svg
        className="mesh-drift h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ opacity: 0.42 }}
      >
        <g stroke="var(--lavender)" strokeOpacity={0.12} strokeWidth={1}>
          {LINKS.map((l, i) => (
            <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} />
          ))}
        </g>
        <g>
          {NODES.map((n, i) => (
            <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.c} fillOpacity={0.35} />
          ))}
        </g>
      </svg>
    </div>
  );
}
