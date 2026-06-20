import Dashboard from "@/components/Dashboard";

// Demo cluster id (matches supabase/seed.sql). Replace with the authenticated
// user's active cluster once auth + cluster selection are wired up.
const DEMO_CLUSTER_ID =
  process.env.NEXT_PUBLIC_DEMO_CLUSTER_ID ?? "a904128f-7c42-4f32-bb9a-a82fca92cf3d";

export default function Home() {
  return <Dashboard clusterId={DEMO_CLUSTER_ID} />;
}
