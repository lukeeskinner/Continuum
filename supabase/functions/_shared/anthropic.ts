// Claude helpers with prompt caching enabled to stay within the $25 budget.
//
// Model note: query synthesis uses Claude Sonnet 4.6; relationship
// classification uses the cheaper Haiku 4.5. Update these aliases if newer
// snapshots ship.
import { ENV } from "./env.ts";

export const MODELS = {
  // Fast/cheap relationship classification.
  HAIKU: "claude-haiku-4-5",
  // Citation-aware synthesis.
  SONNET: "claude-sonnet-4-6",
} as const;

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function claude(opts: {
  model: string;
  system: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ENV.ANTHROPIC_API_KEY(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      // cache_control marks the system prompt as a reusable cache breakpoint.
      system: [
        { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
      ],
      messages: opts.messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic call failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.content?.[0]?.text ?? "";
}
