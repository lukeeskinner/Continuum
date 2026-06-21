// Query engine behind the Spotlight-style command bar.
//
// Primary path: the web hub's `query-synthesize` Edge Function — cross-person
// recall over the whole team graph, returning a citation-aware answer plus the
// contributing subgraph (the same path the dashboard uses).
//
// Fallback: if the hub is unreachable (offline / not configured), degrade to a
// summary of the local on-device buffer so the bar always shows something.
//
// Always resolves with { response, citations }.
const hub = require("./hub");
const store = require("./store");

// Map a query-synthesize subgraph node to a command-bar citation.
function toCitation(node = {}) {
  return {
    app: node.app || null,
    topic: node.topic || node.concept || node.label || null,
    teammate: node.teammate || null,
    when: node.created_at || null,
    source: "hub",
  };
}

// Best-effort local lookup; never throws into the caller.
function localCitations(text) {
  try {
    return store.searchObservations(text, 5).map((row) => ({
      app: row.app || null,
      topic: row.topic || row.concept || null,
      teammate: null,
      when: row.ts ? new Date(row.ts).toISOString() : null,
      source: "local",
    }));
  } catch {
    return [];
  }
}

function localSummary(text, citations) {
  if (!citations.length) {
    return `Couldn't reach the team graph, and nothing on this device matches “${text}” yet.`;
  }
  const lines = citations.map((c) => `• ${c.app || "—"} — ${c.topic || "—"}`).join("\n");
  return `Couldn't reach the team graph. From your on-device activity:\n${lines}`;
}

async function answer(text) {
  const query = String(text || "").trim();
  if (!query) return { response: "Ask me about your team's work.", citations: [] };

  try {
    const { answer: hubAnswer, subgraph } = await hub.querySynthesize(query);
    const nodes = Array.isArray(subgraph?.nodes) ? subgraph.nodes : [];
    return {
      response: hubAnswer || "Nothing relevant in the team graph yet.",
      citations: nodes.map(toCitation),
    };
  } catch (err) {
    console.error("[query] hub error:", err);
    const citations = localCitations(query);
    return { response: localSummary(query, citations), citations };
  }
}

module.exports = { answer, toCitation, localCitations, localSummary };
