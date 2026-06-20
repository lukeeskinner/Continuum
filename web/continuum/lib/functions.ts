// Helpers for invoking Supabase Edge Functions from the browser.
//
// Functions with `verify_jwt = true` (query-synthesize, user-invite,
// voice-transcribe) require the caller's access token in the Authorization
// header; the Supabase gateway also expects the anon key as `apikey`.
import { publicEnv } from "./env";
import { createBrowserClient } from "./supabase/client";

function functionsBase(): string {
  return `${publicEnv.supabaseUrl}/functions/v1`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? publicEnv.supabaseAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicEnv.supabaseAnonKey,
  };
}

// Invoke an edge function with a JSON body and the caller's auth token.
export async function callFunction<T>(
  name: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${functionsBase()}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `${name} failed (${res.status})`);
  }
  return json as T;
}

// Invoke an edge function with a raw binary body (e.g. audio for transcription).
export async function callFunctionRaw<T>(
  name: string,
  body: BodyInit,
  contentType: string,
): Promise<T> {
  const res = await fetch(`${functionsBase()}/${name}`, {
    method: "POST",
    headers: { "Content-Type": contentType, ...(await authHeaders()) },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error ?? `${name} failed (${res.status})`);
  }
  return json as T;
}
