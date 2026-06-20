// Browser-side Supabase client (anon key, RLS-enforced).
//
// A single shared instance is returned so the auth session (persisted to
// localStorage) is consistent across every component that reads it.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "../env";

let browserClient: SupabaseClient | null = null;

export function createBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}
