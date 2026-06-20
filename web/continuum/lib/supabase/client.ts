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
