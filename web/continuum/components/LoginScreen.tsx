"use client";

// Magic-link sign-in. Rendered (outside the app chrome) whenever there is no
// active Supabase session.
import { useState } from "react";
import { useAuth } from "./auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await signIn(email.trim());
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand)" }} />
          <span className="font-display text-xl">Continuum</span>
        </div>

        <div className="glass fade-up rounded-2xl p-8">
          {!sent ? (
            <>
              <p className="eyebrow">Sign in</p>
              <h1 className="font-display mt-3 text-[2rem] leading-tight">
                Enter the <span className="italic text-brand">mesh.</span>
              </h1>
              <p className="mt-3 text-[14px] text-ink-soft">
                We&apos;ll email you a magic link — no password to remember.
              </p>
              <form onSubmit={submit} className="mt-6 flex flex-col gap-2.5">
                <label className="eyebrow" htmlFor="email">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@team.com"
                  className="w-full rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-grad mt-1 py-2.5 text-[14px] disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send magic link →"}
                </button>
                {error && <p className="mt-1 text-[12.5px] text-[var(--edge-contradicts)]">{error}</p>}
              </form>
            </>
          ) : (
            <div className="py-2 text-center">
              <span className="signal-dot pop-in mx-auto mb-6 block !h-3 !w-3" />
              <h1 className="font-display text-[2rem]">Check your inbox</h1>
              <p className="mt-3 text-[14px] text-ink-soft">
                A sign-in link is on its way to <span className="font-medium text-ink">{email}</span>.
              </p>
              <button onClick={() => setSent(false)} className="eyebrow mt-6 text-brand hover:text-ink">
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
