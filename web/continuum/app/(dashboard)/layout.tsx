import AppShell from "@/components/AppShell";

// Layout for the authenticated dashboard surface. Standalone routes like
// /join/[code] live outside this group so they render without the app chrome.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
