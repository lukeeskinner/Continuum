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
    `error_type='${descriptor.error_type ?? "null"}'.` +
    (descriptor.ocr_text ? ` On-screen text: '${descriptor.ocr_text}'.` : "");

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

module.exports = { postMessage, getMemory };
