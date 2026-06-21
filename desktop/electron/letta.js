// Minimal Letta Cloud REST client used by the main process to post visual
// descriptors to the user's persistent agent.
const config = require("./config");

async function postMessage(descriptor) {
  if (!config.lettaAgentId || !config.lettaApiKey) {
    console.warn("[letta] missing agent id or api key; skipping post");
    return null;
  }

  const message =
    `User is active on ${descriptor.app}. Visual analysis: ` +
    `topic='${descriptor.topic}', concept='${descriptor.concept}', ` +
    `error_type='${descriptor.error_type ?? "null"}'.`;

  const res = await fetch(
    `${config.lettaBaseUrl}/v1/agents/${config.lettaAgentId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.lettaApiKey}`,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: message }] }),
    },
  );

  if (!res.ok) {
    console.error("[letta] post failed:", res.status, await res.text());
    return null;
  }
  return res.json();
}

async function getMemory() {
  const res = await fetch(
    `${config.lettaBaseUrl}/v1/agents/${config.lettaAgentId}/memory`,
    { headers: { Authorization: `Bearer ${config.lettaApiKey}` } },
  );
  return res.ok ? res.json() : null;
}

// Pull the assistant's reply text out of a Letta /messages response. Letta
// returns a stream of typed messages (reasoning, tool calls, assistant); we
// want the last assistant message's content, tolerating a few payload shapes.
function extractAssistantText(data) {
  const msgs = Array.isArray(data?.messages) ? data.messages : [];
  const assistant = msgs.filter(
    (m) => m.message_type === "assistant_message" || m.role === "assistant",
  );
  const last = assistant[assistant.length - 1];
  if (!last) return null;
  return normalizeContent(last.content ?? last.text ?? null);
}

function normalizeContent(content) {
  if (!content) return null;
  if (typeof content === "string") return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content
      .map((p) => (typeof p === "string" ? p : (p?.text ?? "")))
      .join("")
      .trim();
    return text || null;
  }
  if (typeof content === "object") return content.text ?? null;
  return null;
}

// Ask the user's Letta agent a question; resolves with the answer text (or null
// when Letta isn't configured / errors, so callers can fall back locally).
async function query(text) {
  if (!config.lettaAgentId || !config.lettaApiKey) return null;

  const res = await fetch(
    `${config.lettaBaseUrl}/v1/agents/${config.lettaAgentId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.lettaApiKey}`,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
    },
  );

  if (!res.ok) {
    console.error("[letta] query failed:", res.status, await res.text());
    return null;
  }
  return extractAssistantText(await res.json());
}

module.exports = { postMessage, getMemory, query, extractAssistantText };
