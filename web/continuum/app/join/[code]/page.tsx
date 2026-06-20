"use client";

// Standalone invite redemption (/join/[code]). Renders outside the dashboard
// chrome. Magic-link signup is mocked; wire to Supabase Auth + `user-onboard`.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CLUSTER, TEAMMATES, ACCENTS } from "@/lib/mock";
import { IconSpark, IconShield, IconArrow } from "@/components/icons";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? CLUSTER.inviteCode).toString().toUpperCase();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const inviter = TEAMMATES[0];
  const others = TEAMMATES.slice(1, 6);

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl btn-grad">
            <IconSpark width={18} height={18} />
          </span>
          <span className="text-xl font-bold tracking-tight">
            Continu<span className="text-gradient">um</span>
          </span>
        </Link>

        <div className="glass fade-up rounded-3xl p-7 text-center">
          {!sent ? (
            <>
              <span className="chip mx-auto bg-lavender/12 text-ink-soft">
                <IconSpark width={13} height={13} className="text-lavender" /> you&apos;re invited
              </span>
              <h1 className="mt-4 text-2xl font-extrabold leading-tight">
                Join <span className="text-gradient">{CLUSTER.name}</span>
              </h1>
              <p className="mt-2 text-sm text-ink-soft">
                <span className="font-semibold text-ink">{inviter.name}</span> invited you to the team
                knowledge mesh.
              </p>

              {/* member stack */}
              <div className="mt-5 flex items-center justify-center">
                {others.map((t, i) => (
                  <span
                    key={t.id}
                    title={t.name}
                    className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white ring-2 ring-white"
                    style={{ background: ACCENTS[t.accent], marginLeft: i === 0 ? 0 : -10 }}
                  >
                    {t.initials}
                  </span>
                ))}
                <span className="ml-2 text-xs font-medium text-ink-faint">
                  {CLUSTER.members} teammates inside
                </span>
              </div>

              <div className="mt-6 flex flex-col gap-2.5 text-left">
                <label className="text-xs font-semibold text-ink-soft">Work email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@team.com"
                  className="w-full rounded-xl border border-line bg-white/70 px-3.5 py-2.5 text-sm outline-none transition focus:border-lavender"
                />
                <button
                  onClick={() => email.trim() && setSent(true)}
                  className="btn-grad mt-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold"
                >
                  Continue with magic link <IconArrow width={15} height={15} />
                </button>
              </div>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
                <IconShield width={13} height={13} className="text-mint" />
                Your screen agent stays on-device. Only meaning is shared.
              </p>
              <p className="mt-2 text-[11px] text-ink-faint">
                Invite code <span className="font-mono font-semibold text-ink-soft">{code}</span>
              </p>
            </>
          ) : (
            <div className="py-6">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/15 text-mint pop-in">
                <IconSpark width={26} height={26} />
              </span>
              <h1 className="mt-4 text-2xl font-extrabold">Check your inbox</h1>
              <p className="mt-2 text-sm text-ink-soft">
                We sent a magic link to <span className="font-semibold text-ink">{email}</span>. Click
                it to join {CLUSTER.name}.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-5 text-xs font-semibold text-lavender hover:underline"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-ink-faint">
          Powered by Continuum · the mesh builds itself
        </p>
      </div>
    </main>
  );
}
