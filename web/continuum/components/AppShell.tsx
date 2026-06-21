"use client";

// Shared chrome. Navigation is a "spine": each section is a node threaded on a
// vertical line, the active one lit. Cluster + member data come from context.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth";
import { useCluster } from "./cluster";
import { accentForUser, initials, displayName } from "@/lib/ui";
import { IconPlus } from "./icons";

const NAV = [
  { href: "/", label: "Overview", end: true },
  { href: "/graph", label: "Live graph" },
  { href: "/query", label: "Ask the mesh" },
  { href: "/manage", label: "Manage" },
];

function isActive(pathname: string, href: string, end?: boolean) {
  return end ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { active, members, online } = useCluster();

  const me = {
    id: user?.id ?? "me",
    name: (user?.user_metadata?.full_name as string) || user?.email || "You",
    accent: accentForUser(user?.id ?? "me"),
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ---------------- Sidebar / spine ---------------- */}
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line/70 px-5 py-6 md:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--brand)", boxShadow: "0 0 0 4px color-mix(in srgb, var(--brand) 22%, transparent)" }}
          />
          <span className="font-display text-[22px] leading-none">Continuum</span>
        </Link>
        <p className="eyebrow mt-2.5 truncate">{active ? active.name : "the mesh builds itself"}</p>

        <nav className="relative mt-8 flex flex-col gap-0.5">
          <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-line" />
          {NAV.map(({ href, label, end }) => {
            const on = isActive(pathname, href, end);
            return (
              <Link
                key={href}
                href={href}
                className="group relative z-10 flex items-center gap-3 rounded-lg py-2.5 pl-1.5 pr-2"
              >
                <span className="grid w-5 place-items-center">
                  <span
                    className="block rounded-full transition-all"
                    style={
                      on
                        ? {
                            width: 11,
                            height: 11,
                            background: "var(--brand)",
                            boxShadow: "0 0 0 4px color-mix(in srgb, var(--brand) 20%, transparent)",
                          }
                        : { width: 9, height: 9, background: "var(--surface)", border: "1.5px solid var(--ink-faint)" }
                    }
                  />
                </span>
                <span className={`text-[14px] transition-colors ${on ? "font-medium text-ink" : "text-ink-soft group-hover:text-ink"}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-[#0b0e1a]"
              style={{ background: me.accent }}
            >
              {initials(me.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">{me.name}</p>
              <p className="eyebrow mt-0.5">{active?.role ?? "—"}</p>
            </div>
            <button onClick={() => signOut()} title="Sign out" className="eyebrow hover:text-ink">
              exit
            </button>
          </div>
        </div>
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-14 shrink-0 items-center gap-4 border-b border-line/70 px-5 backdrop-blur-xl sm:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand)" }} />
            <span className="font-display text-lg leading-none">Continuum</span>
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            <span className="signal-dot" />
            <span className="eyebrow">
              {active?.name ?? "no cluster"}
              <span className="mx-2 text-line">/</span>
              <span className="text-ink-soft">{online.size} observing now</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center sm:flex">
              {members.slice(0, 5).map((m, i) => {
                const name = displayName(m.profiles);
                return (
                  <span
                    key={m.user_id}
                    title={`${name}${online.has(m.user_id) ? " · online" : ""}`}
                    className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold text-[#0b0e1a]"
                    style={{
                      background: accentForUser(m.user_id),
                      marginLeft: i === 0 ? 0 : -7,
                      boxShadow: `0 0 0 2px ${online.has(m.user_id) ? "#2fc4b2" : "#0b0e1a"}`,
                    }}
                  >
                    {initials(name)}
                  </span>
                );
              })}
            </div>
            <Link href="/manage" className="btn-grad flex items-center gap-1.5 px-3.5 py-2 text-[13px]">
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">Invite</span>
            </Link>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* ---------------- Mobile bottom nav ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-[rgba(11,14,26,0.85)] px-2 py-2.5 backdrop-blur-xl md:hidden">
        {NAV.map(({ href, label, end }) => {
          const on = isActive(pathname, href, end);
          return (
            <Link key={href} href={href} className="flex flex-col items-center gap-1.5">
              <span
                className="rounded-full"
                style={on ? { width: 9, height: 9, background: "var(--brand)" } : { width: 7, height: 7, background: "var(--ink-faint)" }}
              />
              <span className={`text-[10px] ${on ? "text-ink" : "text-ink-faint"}`}>{label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
