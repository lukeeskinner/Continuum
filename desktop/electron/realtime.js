// Inbound team activity feed for the ambient overlay.
//
// The desktop has no Redis access, so instead of the dashboard's Redis pub/sub
// it subscribes to Postgres changes via Supabase Realtime. Realtime enforces
// the table RLS per subscriber, so each agent only receives inserts for the
// clusters it belongs to (see migration 0004_realtime.sql).
//
// We surface two signals:
//   - node inserts from *other* teammates (our own captures already show up in
//     the local "your activity" list), and
//   - edge inserts (a cross-person connection the graph just detected).
const { supabase } = require("./supabase");

let channel = null;

// Pure row -> overlay-event mappers (exported for unit testing).
function mapNodeRow(row = {}, nameFor) {
  return {
    kind: "node",
    user_id: row.user_id ?? null,
    teammate: (nameFor && nameFor(row.user_id)) || "A teammate",
    app: row.app || "",
    topic: row.topic || "",
    concept: row.concept || "",
    source_type: row.source_type || "SCREEN",
    at: row.created_at || new Date().toISOString(),
  };
}

function mapEdgeRow(row = {}) {
  return {
    kind: "edge",
    type: row.type || "RELATED_TO",
    explanation: row.explanation || "",
    at: row.created_at || new Date().toISOString(),
  };
}

// Subscribe for `clusterId`. `userId` is filtered out of node events. `nameFor`
// resolves a teammate user id to a display name. `onEvent` receives mapped
// events. Best-effort: returns null (no throw) when there's no cluster.
async function start({ clusterId, userId, nameFor, onEvent }) {
  if (!clusterId || typeof onEvent !== "function") return null;
  await stop();

  const sb = supabase();
  // Realtime evaluates RLS with the caller's JWT; make sure it has the session.
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (token) sb.realtime.setAuth(token);
  } catch {
    // best-effort; an unauthenticated socket simply receives nothing under RLS
  }

  const filter = `cluster_id=eq.${clusterId}`;
  channel = sb
    .channel(`continuum:cluster:${clusterId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "semantic_nodes", filter },
      (payload) => {
        const row = payload?.new ?? {};
        if (userId && row.user_id === userId) return; // our own capture
        onEvent(mapNodeRow(row, nameFor));
      },
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "semantic_edges", filter },
      (payload) => onEvent(mapEdgeRow(payload?.new ?? {})),
    )
    .subscribe();

  return channel;
}

async function stop() {
  if (!channel) return;
  try {
    await supabase().removeChannel(channel);
  } catch {
    // ignore teardown errors
  }
  channel = null;
}

module.exports = { start, stop, mapNodeRow, mapEdgeRow };
