"use client";

// Email/password sign-in for existing teammates. New teammates arrive via an
// invite link, which lands on /onboard and creates the account first.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createBrowserClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInErr) {
      setError(signInErr.message);
      return;
    }
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-zinc-100">
      <form
        onSubmit={signIn}
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6"
      >
        <h1 className="text-lg font-semibold">Continuum</h1>
        <p className="mb-6 text-xs text-zinc-500">Sign in to your workspace.</p>

        <label className="mb-1 block text-xs text-zinc-400">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />

        <label className="mb-1 block text-xs text-zinc-400">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
