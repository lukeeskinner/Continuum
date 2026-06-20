"use client";

// Auth + cluster context for the whole dashboard surface.
//
// Verifies the Supabase session (redirecting to /login when absent), resolves
// the clusters the user belongs to, loads members + the current user's profile
// for the active cluster, and exposes everything the new UI shell + pages need
// to render real data. While loading / when the user has no cluster, it renders
// a standalone status screen instead of the app chrome.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  getMyClusters,
  getClusterMembers,
  getCurrentUser,
  type ClusterMembership,
  type MemberProfile,
  type CurrentUser,
} from "@/lib/data";
import { colorForKey, initialsFor } from "@/lib/colors";
import { IconSpark } from "@/components/icons";

interface ClusterContextValue {
  clusters: ClusterMembership[];
  activeClusterId: string;
  activeCluster: ClusterMembership;
  setActiveClusterId: (id: string) => void;
  role: "admin" | "member";
  members: MemberProfile[];
  currentUser: CurrentUser;
  signOut: () => void;
  nameFor: (userId: string) => string;
  colorFor: (userId: string) => string;
  initialsForUser: (userId: string) => string;
}

const ClusterContext = createContext<ClusterContextValue | null>(null);

export function useCluster(): ClusterContextValue {
  const ctx = useContext(ClusterContext);
  if (!ctx) throw new Error("useCluster must be used within ClusterProvider");
  return ctx;
}

type Status = "loading" | "ready" | "no-clusters";

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="card fade-up flex flex-col items-center gap-4 px-8 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl btn-grad">
          <IconSpark width={22} height={22} />
        </span>
        {children}
      </div>
    </main>
  );
}

export default function ClusterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [clusters, setClusters] = useState<ClusterMembership[]>([]);
  const [activeClusterId, setActiveClusterId] = useState<string>("");
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Session check + cluster resolution.
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
        const [mine, user] = await Promise.all([getMyClusters(), getCurrentUser()]);
        if (cancelled) return;
        setCurrentUser(user);
        if (mine.length === 0) {
          setStatus("no-clusters");
          return;
        }
        setClusters(mine);
        setActiveClusterId((prev) => prev || mine[0].id);
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

  // Load members whenever the active cluster changes.
  useEffect(() => {
    if (!activeClusterId) return;
    let cancelled = false;
    (async () => {
      setMembers([]);
      try {
        const list = await getClusterMembers(activeClusterId);
        if (!cancelled) setMembers(list);
      } catch (err) {
        console.error("failed to load cluster members:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeClusterId]);

  const signOut = useCallback(async () => {
    await createBrowserClient().auth.signOut();
    router.replace("/login");
  }, [router]);

  const nameFor = useCallback(
    (userId: string) => {
      const m = members.find((p) => p.id === userId);
      return m?.full_name || m?.email || userId.slice(0, 8);
    },
    [members],
  );

  const colorFor = useCallback((userId: string) => colorForKey(userId), []);
  const initialsForUser = useCallback(
    (userId: string) => initialsFor(nameFor(userId)),
    [nameFor],
  );

  const value = useMemo<ClusterContextValue | null>(() => {
    if (status !== "ready" || !currentUser) return null;
    const activeCluster = clusters.find((c) => c.id === activeClusterId);
    if (!activeCluster) return null;
    return {
      clusters,
      activeClusterId,
      activeCluster,
      setActiveClusterId,
      role: activeCluster.role,
      members,
      currentUser,
      signOut,
      nameFor,
      colorFor,
      initialsForUser,
    };
  }, [
    status,
    clusters,
    activeClusterId,
    members,
    currentUser,
    signOut,
    nameFor,
    colorFor,
    initialsForUser,
  ]);

  if (status === "loading") {
    return (
      <StatusScreen>
        <p className="text-sm font-medium text-ink-soft">Loading your workspace…</p>
      </StatusScreen>
    );
  }

  if (status === "no-clusters" || !value) {
    return (
      <StatusScreen>
        <h1 className="text-lg font-bold">No workspace yet</h1>
        <p className="max-w-xs text-sm text-ink-soft">
          You&apos;re not part of any cluster yet. Ask an admin to invite you, then sign back in.
        </p>
        <button
          onClick={signOut}
          className="btn-grad rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Sign out
        </button>
      </StatusScreen>
    );
  }

  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>;
}
