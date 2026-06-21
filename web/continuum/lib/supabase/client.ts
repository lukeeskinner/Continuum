// Browser-side Supabase client (anon key, RLS-enforced) — singleton so auth
// state + realtime channels are shared across the app.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "../env";

let _client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}

// A guaranteed-fresh access token for authorizing calls to our own API routes.
// getSession() can return a stale token (supabase-js refreshes lazily), so we
// proactively refresh when it's missing or near expiry.
export async function getAccessToken(): Promise<string> {
  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const soon = Date.now() + 120_000;
  if (!session || ((session.expires_at ?? 0) * 1000) < soon) {
    const { data } = await sb.auth.refreshSession();
    return data.session?.access_token ?? session?.access_token ?? "";
  }
  return session.access_token ?? "";
}
