// Authenticated client for the Continuum web hub's Supabase Edge Functions.
//
// The renderer windows run under a strict CSP and have no Supabase session, so
// every hub call (graph query + voice STT/TTS) is proxied here in the main
// process, where the signed-in session JWT lives. We attach both the user's
// access token (Authorization) and the anon key (apikey) so the Supabase API
// gateway authorizes the request exactly like supabase-js `functions.invoke`.
const config = require("./config");
const { supabase } = require("./supabase");

// Derive the functions base: prefer the explicit SUPABASE_FUNCTIONS_URL, else
// fall back to `${SUPABASE_URL}/functions/v1`.
function functionsBase() {
  if (config.supabaseFunctionsUrl) {
    return config.supabaseFunctionsUrl.replace(/\/+$/, "");
  }
  if (config.supabaseUrl) {
    return `${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
  }
  return null;
}

async function accessToken() {
  const { data } = await supabase().auth.getSession();
  return data?.session?.access_token ?? null;
}

// POST to an Edge Function. `body` is JSON-stringified unless a non-JSON
// contentType is given (voice-transcribe takes a raw audio body). With
// `raw: true` the response is returned as a Buffer (voice-speak returns mp3).
async function callFunction(name, { body, contentType = "application/json", raw = false } = {}) {
  const base = functionsBase();
  if (!base) throw new Error("Supabase functions URL not configured");
  const token = await accessToken();
  if (!token) throw new Error("not signed in");

  const headers = { Authorization: `Bearer ${token}` };
  if (config.supabaseAnonKey) headers.apikey = config.supabaseAnonKey;
  if (contentType) headers["Content-Type"] = contentType;

  let payload = body;
  if (contentType === "application/json" && body && typeof body !== "string") {
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${base}/${name}`, { method: "POST", headers, body: payload });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${name} ${res.status}: ${detail.slice(0, 200)}`);
  }
  if (raw) return Buffer.from(await res.arrayBuffer());
  return res.json();
}

// Cross-person recall over the team graph. Returns the same shape the dashboard
// renders: { answer, subgraph: { nodes, edges } }.
async function querySynthesize(query) {
  if (!config.clusterId) throw new Error("no active cluster");
  return callFunction("query-synthesize", {
    body: { query, cluster_id: config.clusterId },
  });
}

// Deepgram STT. `audio` is a Buffer of the recorded clip. Returns the trimmed
// transcript (possibly empty).
async function transcribe(audio, mime = "audio/webm") {
  const json = await callFunction("voice-transcribe", { body: audio, contentType: mime });
  return String(json?.transcript ?? "").trim();
}

// Deepgram aura TTS. Returns the spoken answer as an mp3 Buffer.
async function speak(text) {
  return callFunction("voice-speak", { body: { text }, raw: true });
}

module.exports = { querySynthesize, transcribe, speak, functionsBase, callFunction };
