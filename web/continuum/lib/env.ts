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
  // Web-research agent, used by /api/research. Browserbase drives the browser;
  // Claude writes the summary; OpenAI (optional) embeds findings for the graph.
  browserbaseApiKey: process.env.BROWSERBASE_API_KEY ?? "",
  browserbaseProjectId: process.env.BROWSERBASE_PROJECT_ID ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
};
