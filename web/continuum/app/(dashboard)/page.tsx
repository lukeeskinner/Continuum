// Overview — the thesis of the product, told editorially, with a live mesh.
import Link from "next/link";
import {
  STATS,
  ACTIVITY,
  TEAMMATES,
  ACCENTS,
  CLUSTER,
  teammateById,
} from "@/lib/mock";
import HeroMesh from "@/components/HeroMesh";

const METRICS = [
  { value: STATS.nodes, label: "concepts woven" },
  { value: STATS.edges, label: "connections" },
  { value: STATS.connectionsToday, label: "surfaced today" },
  { value: STATS.online, label: "observing now" },
];

const STEPS = [
  { n: "1", title: "Observe", body: "A local agent reads what you're working on. It never leaves your machine." },
  { n: "2", title: "Filter", body: "You decide what stays private and what becomes shareable meaning." },
  { n: "3", title: "Weave", body: "The meaning joins one shared graph, linking your work to everyone's." },
];

export default function OverviewPage() {
  const online = TEAMMATES.filter((t) => t.online);
  const budgetPct = CLUSTER.monthlySpend / CLUSTER.monthlyBudget;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-9 px-5 py-8 pb-24 sm:px-8 md:pb-12">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-12">
        <div className="fade-up lg:col-span-7">
          <p className="eyebrow">On-device · privacy-first</p>
          <h1 className="font-display mt-5 text-[2.7rem] leading-[1.0] sm:text-[3.6rem]">
            Somebody already
            <br />
            <span className="italic text-brand">solved this.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-ink-soft">
            Continuum watches how each teammate works — on their own machine — and weaves the{" "}
            <span className="font-medium text-ink">meaning</span> of it into one shared graph. When
            your problem matches someone&apos;s past, the connection surfaces on its own. No asking,
            no searching.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/graph" className="btn-grad px-5 py-2.5 text-[14px]">
              Open the live graph →
            </Link>
            <Link
              href="/query"
              className="card card-hover px-5 py-2.5 text-[14px] font-medium text-ink"
            >
              Ask the mesh
            </Link>
          </div>
        </div>

        <div className="fade-up lg:col-span-5" style={{ animationDelay: "100ms" }}>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="eyebrow">cluster · {CLUSTER.name}</span>
              <span className="eyebrow flex items-center gap-1.5 text-ink-soft">
                <span className="signal-dot" /> weaving
              </span>
            </div>
            <div
              className="h-[300px]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(142,123,240,0.10) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            >
              <HeroMesh />
            </div>
          </div>
        </div>
      </section>

      {/* Instrument metric strip */}
      <section className="card flex flex-col divide-y divide-line fade-up sm:flex-row sm:divide-x sm:divide-y-0">
        {METRICS.map((m) => (
          <div key={m.label} className="flex-1 px-6 py-5">
            <p className="stat text-[2.4rem] text-ink">{m.value}</p>
            <p className="eyebrow mt-2">{m.label}</p>
          </div>
        ))}
      </section>

      {/* Signal timeline + side column */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="card fade-up p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <p className="eyebrow">Signal · recent captures</p>
            <Link href="/graph" className="eyebrow text-brand hover:text-ink">
              open graph →
            </Link>
          </div>
          <ol className="relative">
            <span aria-hidden className="absolute bottom-2 left-[5px] top-1 w-px bg-line" />
            {ACTIVITY.map((a) => {
              const t = teammateById(a.user);
              return (
                <li key={a.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
                  <span
                    className="relative z-10 mt-1.5 block h-[11px] w-[11px] shrink-0 rounded-full ring-4"
                    style={{ background: t ? ACCENTS[t.accent] : "var(--ink-faint)", color: "var(--surface)" }}
                  />
                  <div className="min-w-0 flex-1 border-b border-line/60 pb-4">
                    <p className="text-[14px] leading-snug">
                      <span className="font-medium">{t?.name.split(" ")[0] ?? "Someone"}</span>{" "}
                      <span className="text-ink-soft">{a.text}</span>
                    </p>
                    <p className="eyebrow mt-1.5">{a.time}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card fade-up p-6">
            <p className="eyebrow mb-4">Observing now</p>
            <ul className="flex flex-col gap-3.5">
              {online.map((t) => (
                <li key={t.id} className="flex items-center gap-3">
                  <span className="relative">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-semibold text-[#0b0e1a]"
                      style={{ background: ACCENTS[t.accent] }}
                    >
                      {t.initials}
                    </span>
                    <span className="dot-online absolute -bottom-0.5 -right-0.5 ring-2 ring-[#0b0e1a]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{t.name}</p>
                    <p className="truncate text-[11px] text-ink-faint">{t.focus}</p>
                  </div>
                  <span className="eyebrow shrink-0">{t.app}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card fade-up p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Claude budget</p>
              <Link href="/manage" className="eyebrow text-brand hover:text-ink">
                manage
              </Link>
            </div>
            <p className="stat text-[2rem] text-ink">
              ${CLUSTER.monthlySpend.toFixed(2)}
              <span className="tnum ml-1 align-middle text-[13px] text-ink-faint">
                / ${CLUSTER.monthlyBudget}
              </span>
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{ width: `${budgetPct * 100}%`, background: "var(--mint)" }}
              />
            </div>
            <p className="mt-2.5 text-[12px] text-ink-faint">
              {Math.round((1 - budgetPct) * 100)}% left this month · cost stays low because vision
              runs on-device.
            </p>
          </div>
        </div>
      </section>

      {/* How the mesh forms — a real sequence, threaded */}
      <section className="card fade-up p-6 sm:p-8">
        <p className="eyebrow">How the mesh forms</p>
        <div className="relative mt-7 grid gap-8 sm:grid-cols-3 sm:gap-6">
          <span
            aria-hidden
            className="absolute left-[12%] right-[12%] top-[6px] hidden h-px bg-line sm:block"
          />
          {STEPS.map((s) => (
            <div key={s.n} className="relative">
              <span
                className="relative z-10 grid h-[13px] w-[13px] place-items-center rounded-full ring-4 ring-[var(--surface)]"
                style={{ background: "var(--brand)" }}
              />
              <p className="eyebrow mt-4">step {s.n}</p>
              <h3 className="font-display mt-1 text-2xl">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
