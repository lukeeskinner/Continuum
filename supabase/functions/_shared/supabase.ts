// Service-role Supabase client for Edge Functions. Bypasses RLS — only use
// server-side after validating the caller.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ENV } from "./env.ts";

export function adminClient(): SupabaseClient {
  return createClient(ENV.SUPABASE_URL(), ENV.SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
