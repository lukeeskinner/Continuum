// voice-transcribe — Transcribe an audio blob (WAV/MP3) via Deepgram for the
// dashboard's voice query input.
//
// Auth: requires a valid Supabase JWT (verify_jwt = true).
import { handleOptions, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const contentType = req.headers.get("content-type") ?? "audio/wav";
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0) {
    return jsonResponse({ error: "empty audio body" }, 400);
  }

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
    {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Token ${ENV.DEEPGRAM_API_KEY()}`,
      },
      body: audio,
    },
  );

  if (!res.ok) {
    return jsonResponse(
      { error: `deepgram failed: ${res.status} ${await res.text()}` },
      502,
    );
  }

  const json = await res.json();
  const transcript =
    json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

  return new Response(JSON.stringify({ transcript }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
