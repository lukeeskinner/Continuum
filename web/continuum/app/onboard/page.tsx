"use client";

// Invite redemption. The link from `user-invite` lands here with ?token=...;
// the new teammate sets a name + password, which calls `user-onboard` to create
// their account, provision a Letta agent, and join the cluster. We then sign
// them in and send them to the dashboard.
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { callFunction } from "@/lib/functions";
import { createBrowserClient } from "@/lib/supabase/client";

interface OnboardResponse {
  onboarded: boolean;
  user_id: string;
  letta_agent_id: string | null;
}

function OnboardForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing invite token. Use the link from your invite email.");
      return;
    }
    setLoading(true);
    try {
      await callFunction<OnboardResponse>("user-onboard", {
        token,
        full_name: fullName,
        password,
      });
      // Sign in with the invited email + chosen password, then enter the app.
      const supabase = createBrowserClient();
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        // Account exists; let them sign in manually.
        router.replace("/login");
        return;
      }
      router.replace("/");
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6"
    >
      <h1 className="text-lg font-semibold">Join your workspace</h1>
      <p className="mb-6 text-xs text-zinc-500">Set up your Continuum account.</p>

      <label className="mb-1 block text-xs text-zinc-400">
        Email (the one you were invited with)
      </label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />

      <label className="mb-1 block text-xs text-zinc-400">Full name</label>
      <input
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />

      <label className="mb-1 block text-xs text-zinc-400">Password</label>
      <input
        type="password"
        required
        minLength={8}
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
        {loading ? "Joining…" : "Join workspace"}
      </button>
    </form>
  );
}

export default function OnboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-zinc-100">
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <OnboardForm />
      </Suspense>
    </main>
  );
}
