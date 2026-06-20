import AppShell from "@/components/AppShell";
import ClusterProvider from "@/components/ClusterProvider";

// Layout for the authenticated dashboard surface. ClusterProvider gates on the
// Supabase session and supplies real cluster/member context to the shell + every
// page. Standalone routes like /login, /onboard, and /join live outside this
// group so they render without the app chrome (or auth gate).
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClusterProvider>
      <AppShell>{children}</AppShell>
    </ClusterProvider>
  );
}
