"use client";

// Invite redemption (/onboard?token=…). Posts to the `user-onboard` Edge
// Function, which validates the token, creates the account, and links the
// cluster. Standalone — renders without the dashboard chrome.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

function OnboardInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !fullName.trim() || password.length < 8) return;
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().functions.invoke("user-onboard", {
      body: { token, full_name: fullName.trim(), password },
    });
    setBusy(false);
    if (error) {
      setError(error.message || "Couldn't redeem this invite.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand)" }} />
          <span className="font-display text-xl">Continuum</span>
        </div>

        <div className="glass fade-up rounded-2xl p-8">
          {done ? (
            <div className="py-2 text-center">
              <span className="signal-dot pop-in mx-auto mb-6 block !h-3 !w-3" />
              <h1 className="font-display text-[2rem]">You&apos;re in</h1>
              <p className="mt-3 text-[14px] text-ink-soft">
                Your account is set up. Sign in to enter the mesh.
              </p>
              <Link href="/" className="btn-grad mt-6 inline-block px-5 py-2.5 text-[14px]">
                Go to sign in →
              </Link>
            </div>
          ) : !token ? (
            <div className="text-center">
              <p className="eyebrow">Invalid link</p>
              <h1 className="font-display mt-3 text-[2rem]">No invite token</h1>
              <p className="mt-3 text-[14px] text-ink-soft">Ask your manager for a fresh invite link.</p>
            </div>
          ) : (
            <>
              <p className="eyebrow">Redeem invite</p>
              <h1 className="font-display mt-3 text-[2rem] leading-tight">
                Join the <span className="italic text-brand">mesh.</span>
              </h1>
              <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="eyebrow" htmlFor="name">Full name</label>
                  <input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="w-full rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="eyebrow" htmlFor="pw">Password</label>
                  <input
                    id="pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="at least 8 characters"
                    className="w-full rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !fullName.trim() || password.length < 8}
                  className="btn-grad mt-1 py-2.5 text-[14px] disabled:opacity-40"
                >
                  {busy ? "Joining…" : "Create account →"}
                </button>
                {error && <p className="text-[12.5px] text-[var(--edge-contradicts)]">{error}</p>}
              </form>
              <p className="mt-5 text-[12px] leading-relaxed text-ink-faint">
                Your screen agent stays on your machine. Only meaning is shared.
              </p>
            </>
          )}
        </div>

        <p className="eyebrow mt-6 text-center">Continuum · the mesh builds itself</p>
      </div>
    </main>
  );
}

export default function OnboardPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center"><span className="eyebrow">loading…</span></main>}>
      <OnboardInner />
    </Suspense>
  );
}
