"use client";

// Standalone invite redemption (/join/[code]). Renders outside the dashboard
// chrome. Magic-link signup is mocked; wire to Supabase Auth + `user-onboard`.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CLUSTER, TEAMMATES, ACCENTS } from "@/lib/mock";

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
        <Link href="/" className="mb-7 flex items-center justify-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand)" }} />
          <span className="font-display text-xl">Continuum</span>
        </Link>

        <div className="glass fade-up rounded-2xl p-8 text-center">
          {!sent ? (
            <>
              <p className="eyebrow">You&apos;re invited</p>
              <h1 className="font-display mt-3 text-[2rem] leading-tight">
                Join <span className="italic text-brand">{CLUSTER.name}</span>
              </h1>
              <p className="mt-3 text-[14px] text-ink-soft">
                <span className="font-medium text-ink">{inviter.name}</span> wants you on the team
                knowledge mesh.
              </p>

              {/* member stack */}
              <div className="mt-6 flex items-center justify-center">
                {others.map((t, i) => (
                  <span
                    key={t.id}
                    title={t.name}
                    className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-semibold text-[#0b0e1a] ring-2 ring-[#0b0e1a]"
                    style={{ background: ACCENTS[t.accent], marginLeft: i === 0 ? 0 : -10 }}
                  >
                    {t.initials}
                  </span>
                ))}
                <span className="eyebrow ml-3">{CLUSTER.members} inside</span>
              </div>

              <div className="mt-7 flex flex-col gap-2.5 text-left">
                <label className="eyebrow">Work email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@team.com"
                  className="w-full rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
                />
                <button
                  onClick={() => email.trim() && setSent(true)}
                  className="btn-grad mt-1 py-2.5 text-[14px]"
                >
                  Continue with magic link →
                </button>
              </div>

              <p className="mt-6 text-[12px] leading-relaxed text-ink-faint">
                Your screen agent stays on your machine. Only meaning is shared.
              </p>
              <p className="eyebrow mt-2.5">code · {code}</p>
            </>
          ) : (
            <div className="py-6">
              <span
                className="signal-dot pop-in mx-auto mb-6 block !h-3 !w-3"
              />
              <h1 className="font-display text-[2rem]">Check your inbox</h1>
              <p className="mt-3 text-[14px] text-ink-soft">
                We sent a magic link to <span className="font-medium text-ink">{email}</span>. Click
                it to join {CLUSTER.name}.
              </p>
              <button
                onClick={() => setSent(false)}
                className="eyebrow mt-6 text-brand hover:text-ink"
              >
                use a different email
              </button>
            </div>
          )}
        </div>

        <p className="eyebrow mt-6 text-center">Continuum · the mesh builds itself</p>
      </div>
    </main>
  );
}
