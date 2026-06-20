// Typed access to web app environment variables.
// Public (NEXT_PUBLIC_*) vars are safe to expose to the browser.

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

// Server-only. Never import these into client components.
export const serverEnv = {
  redisUrl: process.env.REDIS_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};
