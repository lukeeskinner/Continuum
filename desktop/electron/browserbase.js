// Opt-in Browserbase enrichment trigger.
//
// When an observation references a URL on an allowlisted domain, ask the
// `browserbase-enrich` Edge Function to headlessly fetch the page, embed it, and
// add it to the shared graph as a BROWSER-sourced node. Domain allowlisting is
// controlled by BROWSERBASE_DOMAINS (see config.js).
const config = require("./config");

const URL_RE = /https?:\/\/[^\s"'<>]+/i;

// Pull the first URL out of the descriptor's free-text fields, if any.
function findEnrichableUrl(descriptor) {
  if (!config.browserbaseDomains.length) return null;
  const haystack = [descriptor.topic, descriptor.concept, descriptor.app]
    .filter(Boolean)
    .join(" ");
  const match = haystack.match(URL_RE);
  if (!match) return null;

  let url = match[0].replace(/[.,);]+$/, "");
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const allowed = config.browserbaseDomains.some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
  return allowed ? url : null;
}

async function enrich(url) {
  if (!config.supabaseFunctionsUrl || !config.agentSyncSecret) {
    console.warn("[browserbase] missing functions url or secret; skipping enrich");
    return null;
  }
  if (!config.userId || !config.clusterId) return null;

  const res = await fetch(`${config.supabaseFunctionsUrl}/browserbase-enrich`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-continuum-secret": config.agentSyncSecret,
    },
    body: JSON.stringify({
      url,
      user_id: config.userId,
      cluster_id: config.clusterId,
    }),
  });

  if (!res.ok) {
    console.error("[browserbase] enrich failed:", res.status, await res.text());
    return null;
  }
  return res.json();
}

module.exports = { findEnrichableUrl, enrich };
