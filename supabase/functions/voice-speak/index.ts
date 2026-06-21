// voice-speak — Synthesize speech from text via Deepgram aura TTS, for the
// desktop command bar to read a synthesized answer aloud.
//
// Request:  POST { text: string }  (optionally { model: string })
// Response: audio/mpeg (mp3) bytes.
//
// Auth: requires a valid Supabase JWT (verify_jwt = true).
import { handleOptions, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";

const DEFAULT_VOICE = "aura-asteria-en";
// Deepgram caps a single /v1/speak request; keep well under it and trim the
// spoken answer so playback stays snappy.
const MAX_CHARS = 1800;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  let body: { text?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }

  const text = (body.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return jsonResponse({ error: "missing text" }, 400);

  const model = body.model?.trim() || DEFAULT_VOICE;
  const res = await fetch(
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${ENV.DEEPGRAM_API_KEY()}`,
      },
      body: JSON.stringify({ text }),
    },
  );

  if (!res.ok) {
    return jsonResponse(
      { error: `deepgram failed: ${res.status} ${await res.text()}` },
      502,
    );
  }

  // Stream the mp3 straight back to the caller.
  return new Response(res.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
});
