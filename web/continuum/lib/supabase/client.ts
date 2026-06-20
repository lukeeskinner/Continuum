// Browser-side Supabase client (anon key, RLS-enforced).
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "../env";

export function createBrowserClient() {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
