import { AuthProvider } from "@/components/auth";
import DashboardGate from "@/components/DashboardGate";

// Authenticated dashboard surface. The gate handles session/login; standalone
// routes like /onboard live outside this group so they render without chrome.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardGate>{children}</DashboardGate>
    </AuthProvider>
  );
}
