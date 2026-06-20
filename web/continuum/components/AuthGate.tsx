"use client";

// Client-side auth + cluster resolution gate. Redirects to /login when there's
// no session, loads the user's clusters, lets them pick an active one, and
// renders the dashboard for it.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { getMyClusters, type ClusterMembership } from "@/lib/data";
import Dashboard from "./Dashboard";

type Status = "loading" | "ready" | "no-clusters";

export default function AuthGate() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [clusters, setClusters] = useState<ClusterMembership[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserClient();

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      try {
        const mine = await getMyClusters();
        if (cancelled) return;
        if (mine.length === 0) {
          setStatus("no-clusters");
          return;
        }
        setClusters(mine);
        setActiveId(mine[0].id);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("no-clusters");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function signOut() {
    await createBrowserClient().auth.signOut();
    router.replace("/login");
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        Loading workspace…
      </main>
    );
  }

  if (status === "no-clusters") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black text-zinc-300">
        <p>You&apos;re not part of any workspace yet.</p>
        <p className="text-xs text-zinc-500">Ask an admin to invite you.</p>
        <button onClick={signOut} className="text-xs text-indigo-400 hover:underline">
          Sign out
        </button>
      </main>
    );
  }

  const active = clusters.find((c) => c.id === activeId)!;

  return (
    <Dashboard
      clusterId={activeId}
      clusters={clusters}
      role={active.role}
      onSelectCluster={setActiveId}
      onSignOut={signOut}
    />
  );
}
