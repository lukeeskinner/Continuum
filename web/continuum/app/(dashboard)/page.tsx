// Overview / home: the story + live pulse of the mesh.
import Link from "next/link";
import {
  STATS,
  ACTIVITY,
  TEAMMATES,
  ACCENTS,
  CLUSTER,
  teammateById,
  type ActivityKind,
} from "@/lib/mock";
import {
  IconGraph,
  IconChat,
  IconArrow,
  IconBolt,
  IconLink,
  IconUsers,
  IconShield,
  IconSpark,
} from "@/components/icons";

const KIND_STYLE: Record<ActivityKind, { color: string; label: string }> = {
  node: { color: "var(--lavender)", label: "captured" },
  edge: { color: "var(--mint)", label: "connection" },
  member: { color: "var(--sky)", label: "presence" },
  query: { color: "var(--peach)", label: "query" },
};

function StatCard({
  label,
  value,
  accent,
  Icon,
  delay,
}: {
  label: string;
  value: string | number;
  accent: string;
  Icon: (p: { width?: number; height?: number; className?: string }) => React.ReactNode;
  delay: number;
}) {
  return (
    <div className="card card-hover fade-up p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <Icon width={18} height={18} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
    </div>
  );
}

export default function OverviewPage() {
  const online = TEAMMATES.filter((t) => t.online);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 pb-24 md:pb-10">
      {/* Hero */}
      <section className="card fade-up relative overflow-hidden p-7 sm:p-9">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--pink), transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-20 right-24 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--sky), transparent 65%)" }}
        />
        <span className="chip bg-lavender/12 text-ink-soft">
          <IconSpark width={13} height={13} className="text-lavender" /> on-device · privacy-first
        </span>
        <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
          Just work.<br />
          <span className="text-gradient">The mesh builds itself.</span>
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-ink-soft sm:text-base">
          Every teammate runs a lightweight on-device agent. It quietly turns what you&apos;re working
          on into meaning — never screenshots — and weaves it into one shared knowledge graph. No
          uploads, no pipelines. Surprising connections just surface.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/graph" className="btn-grad flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            <IconGraph width={17} height={17} /> Open live graph
          </Link>
          <Link
            href="/query"
            className="card card-hover flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-ink"
          >
            <IconChat width={17} height={17} className="text-lavender" /> Ask the mesh
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Concepts in graph" value={STATS.nodes} accent={ACCENTS.lavender} Icon={IconGraph} delay={40} />
        <StatCard label="Connections" value={STATS.edges} accent={ACCENTS.mint} Icon={IconLink} delay={90} />
        <StatCard label="Found today" value={STATS.connectionsToday} accent={ACCENTS.peach} Icon={IconBolt} delay={140} />
        <StatCard label="Online now" value={STATS.online} accent={ACCENTS.sky} Icon={IconUsers} delay={190} />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Activity feed */}
        <section className="card fade-up p-5 lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <span className="dot-online" /> Live activity
            </h2>
            <Link href="/graph" className="flex items-center gap-1 text-xs font-semibold text-lavender hover:underline">
              View graph <IconArrow width={13} height={13} />
            </Link>
          </div>
          <ul className="flex flex-col">
            {ACTIVITY.map((a, i) => {
              const t = teammateById(a.user);
              const ks = KIND_STYLE[a.kind];
              return (
                <li
                  key={a.id}
                  className="fade-up flex items-start gap-3 border-b border-line/70 py-3 last:border-0"
                  style={{ animationDelay: `${160 + i * 50}ms` }}
                >
                  <span
                    className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: t ? ACCENTS[t.accent] : ACCENTS.lavender }}
                  >
                    {t?.initials ?? "··"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{t?.name.split(" ")[0] ?? "Someone"}</span>{" "}
                      <span className="text-ink-soft">{a.text}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className="chip text-[10px]"
                        style={{ background: `color-mix(in srgb, ${ks.color} 14%, transparent)`, color: "var(--ink-soft)" }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ks.color }} />
                        {ks.label}
                      </span>
                      <span className="text-[11px] text-ink-faint">{a.time}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Right column: online + spend */}
        <div className="flex flex-col gap-5">
          <section className="card fade-up p-5" style={{ animationDelay: "160ms" }}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
              <IconUsers width={16} height={16} className="text-sky" /> Who&apos;s online
            </h2>
            <ul className="flex flex-col gap-3">
              {online.map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <span className="relative">
                    <span
                      className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: ACCENTS[t.accent] }}
                    >
                      {t.initials}
                    </span>
                    <span className="dot-online absolute -bottom-0.5 -right-0.5 ring-2 ring-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.name}</p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {t.focus} · {t.app}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card fade-up p-5" style={{ animationDelay: "200ms" }}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
                <IconShield width={16} height={16} className="text-mint" /> Claude budget
              </h2>
              <Link href="/manage" className="text-xs font-semibold text-lavender hover:underline">
                Manage
              </Link>
            </div>
            <p className="text-2xl font-extrabold">
              ${CLUSTER.monthlySpend.toFixed(2)}
              <span className="text-sm font-medium text-ink-faint"> / ${CLUSTER.monthlyBudget}</span>
            </p>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(CLUSTER.monthlySpend / CLUSTER.monthlyBudget) * 100}%`,
                  background: "linear-gradient(90deg, var(--mint), var(--sky))",
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              {Math.round((1 - CLUSTER.monthlySpend / CLUSTER.monthlyBudget) * 100)}% of monthly budget
              remaining.
            </p>
          </section>
        </div>
      </div>

      {/* How it works */}
      <section className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          { Icon: IconSpark, accent: ACCENTS.pink, title: "Observe", body: "A local agent reads what you're working on — fully on-device." },
          { Icon: IconShield, accent: ACCENTS.lavender, title: "Filter", body: "A privacy filter decides what stays local vs. shared as meaning." },
          { Icon: IconGraph, accent: ACCENTS.sky, title: "Mesh", body: "Semantic embeddings weave into one shared, living team graph." },
        ].map((s, i) => (
          <div key={s.title} className="card card-hover fade-up p-5" style={{ animationDelay: `${220 + i * 60}ms` }}>
            <span
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: `${s.accent}1f`, color: s.accent }}
            >
              <s.Icon width={20} height={20} />
            </span>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
              Step {i + 1}
            </p>
            <h3 className="text-lg font-bold">{s.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
