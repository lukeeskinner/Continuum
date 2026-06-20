import AuthGate from "@/components/AuthGate";

// The dashboard is gated client-side: AuthGate verifies the Supabase session,
// resolves the user's active cluster, and renders the realtime graph.
export default function Home() {
  return <AuthGate />;
}
