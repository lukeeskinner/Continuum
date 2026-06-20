// Centralized environment access for Edge Functions.
// Throws early with a clear message when a required secret is missing.

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

// Secrets are configured via `supabase secrets set` (see supabase/.env.example).
export const ENV = {
  SUPABASE_URL: () => requireEnv("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  REDIS_URL: () => requireEnv("REDIS_URL"),
  OPENAI_API_KEY: () => requireEnv("OPENAI_API_KEY"),
  ANTHROPIC_API_KEY: () => requireEnv("ANTHROPIC_API_KEY"),
  DEEPGRAM_API_KEY: () => requireEnv("DEEPGRAM_API_KEY"),
  LETTA_API_KEY: () => requireEnv("LETTA_API_KEY"),
  RESEND_API_KEY: () => optionalEnv("RESEND_API_KEY"),
  CRON_SECRET: () => requireEnv("CRON_SECRET"),
  AGENT_SYNC_SECRET: () => requireEnv("AGENT_SYNC_SECRET"),
  APP_URL: () => optionalEnv("APP_URL", "http://localhost:3000"),
} as const;
