"use client";

// Shared application chrome: gradient sidebar nav + glass topbar.
// Wraps every dashboard route so navigation + real cluster context persist.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCluster } from "@/components/ClusterProvider";
import { initialsFor } from "@/lib/colors";
import InviteModal from "@/components/InviteModal";
import {
  IconHome,
  IconGraph,
  IconChat,
  IconShield,
  IconSpark,
  IconPlus,
} from "./icons";

const NAV = [
  { href: "/", label: "Overview", Icon: IconHome, end: true },
  { href: "/graph", label: "Live Graph", Icon: IconGraph },
  { href: "/query", label: "Ask the Mesh", Icon: IconChat },
  { href: "/manage", label: "Manage", Icon: IconShield },
];

function isActive(pathname: string, href: string, end?: boolean) {
  if (end) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    clusters,
    activeCluster,
    activeClusterId,
    setActiveClusterId,
    role,
    members,
    currentUser,
    signOut,
    colorFor,
  } = useCluster();
  const [inviteOpen, setInviteOpen] = useState(false);

  const currentName = currentUser.full_name || currentUser.email;
  const stack = members.slice(0, 5);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-2 border-r border-line/70 bg-white/55 px-4 py-5 backdrop-blur-xl md:flex">
        <Link href="/" className="mb-4 flex items-center gap-2.5 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl btn-grad">
            <IconSpark width={18} height={18} />
          </span>
          <span className="text-[19px] font-bold tracking-tight">
            Continu<span className="text-gradient">um</span>
          </span>
        </Link>

        {/* Cluster pill / switcher */}
        <div className="card mb-2 flex items-center gap-2.5 px-3 py-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${colorFor(activeClusterId)}, #59c2ff)` }}
          >
            {initialsFor(activeCluster.name)}
          </span>
          <div className="min-w-0 flex-1">
            {clusters.length > 1 ? (
              <select
                value={activeClusterId}
                onChange={(e) => setActiveClusterId(e.target.value)}
                className="w-full truncate bg-transparent text-[13px] font-semibold leading-tight outline-none"
              >
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="truncate text-[13px] font-semibold leading-tight">{activeCluster.name}</p>
            )}
            <p className="text-[11px] capitalize text-ink-faint">
              {role} · {members.length} {members.length === 1 ? "member" : "members"}
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon, end }) => {
            const active = isActive(pathname, href, end);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "text-ink"
                    : "text-ink-soft hover:bg-white/70 hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-lavender/18 via-pink/12 to-sky/15 ring-1 ring-lavender/25" />
                )}
                <Icon
                  width={19}
                  height={19}
                  className={active ? "text-lavender" : "text-ink-faint group-hover:text-ink-soft"}
                />
                {label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-lavender" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {role === "admin" && (
            <button
              onClick={() => setInviteOpen(true)}
              className="card card-hover flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold text-ink-soft"
            >
              <IconPlus width={16} height={16} className="text-lavender" />
              Invite a teammate
            </button>
          )}
          <div className="flex items-center gap-2.5 px-1">
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white"
              style={{ background: colorFor(currentUser.id) }}
            >
              {initialsFor(currentName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{currentName}</p>
              <p className="text-[11px] capitalize text-ink-faint">{role}</p>
            </div>
            <button
              onClick={signOut}
              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-faint transition hover:bg-white/70 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="z-20 flex shrink-0 items-center gap-3 border-b border-line/70 bg-white/55 px-4 py-3 backdrop-blur-xl sm:px-6">
          {/* mobile logo */}
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg btn-grad">
              <IconSpark width={16} height={16} />
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="dot-online" />
            <span className="text-sm font-medium text-ink-soft">
              Mesh live · <span className="text-ink">{members.length} teammates</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* member avatar stack */}
            <div className="hidden items-center sm:flex">
              {stack.map((m, i) => {
                const name = m.full_name || m.email;
                return (
                  <span
                    key={m.id}
                    title={name}
                    className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white"
                    style={{ background: colorFor(m.id), marginLeft: i === 0 ? 0 : -8 }}
                  >
                    {initialsFor(name)}
                  </span>
                );
              })}
            </div>
            {role === "admin" && (
              <button
                onClick={() => setInviteOpen(true)}
                className="btn-grad flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold"
              >
                <IconPlus width={16} height={16} />
                <span className="hidden sm:inline">Invite</span>
              </button>
            )}
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-white/85 px-2 py-2 backdrop-blur-xl md:hidden">
        {NAV.map(({ href, label, Icon, end }) => {
          const active = isActive(pathname, href, end);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] font-medium ${
                active ? "text-lavender" : "text-ink-faint"
              }`}
            >
              <Icon width={20} height={20} />
              {label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>

      {inviteOpen && (
        <InviteModal clusterId={activeClusterId} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  );
}
