"use client";

// Decides what the dashboard surface shows: a config notice (no creds), a
// splash while the session resolves, the login screen, or the live app.
import { useAuth } from "./auth";
import { ClusterProvider } from "./cluster";
import AppShell from "./AppShell";
import LoginScreen from "./LoginScreen";

function Splash() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="flex items-center gap-3">
        <span className="signal-dot" />
        <span className="eyebrow">weaving the mesh…</span>
      </div>
    </main>
  );
}

function ConfigNotice() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <p className="eyebrow">Not configured</p>
        <h1 className="font-display mt-3 text-2xl">Add your Supabase keys</h1>
        <p className="mt-3 text-[14px] text-ink-soft">
          Set <span className="tnum text-ink">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="tnum text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> in{" "}
          <span className="tnum text-ink">.env.local</span>, then restart the dev server.
        </p>
      </div>
    </main>
  );
}

export default function DashboardGate({ children }: { children: React.ReactNode }) {
  const { loading, user, configured } = useAuth();
  if (!configured) return <ConfigNotice />;
  if (loading) return <Splash />;
  if (!user) return <LoginScreen />;
  return (
    <ClusterProvider>
      <AppShell>{children}</AppShell>
    </ClusterProvider>
  );
}
