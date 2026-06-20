"use client";

// Auth context: tracks the Supabase session and exposes magic-link sign-in.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within <AuthProvider>");
  return c;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) return;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  const signIn = useCallback(
    async (email: string) => {
      if (!configured) return { error: "Supabase is not configured." };
      const { error } = await getSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      return error ? { error: error.message } : {};
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (configured) await getSupabase().auth.signOut();
  }, [configured]);

  return (
    <Ctx.Provider
      value={{ session, user: session?.user ?? null, loading, configured, signIn, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}
