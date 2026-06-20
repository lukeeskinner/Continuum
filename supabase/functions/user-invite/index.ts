// user-invite — Generate a secure join link for a teammate and (optionally)
// email it via Resend. Caller must be an admin of the target cluster.
//
// Auth: requires a valid Supabase JWT (verify_jwt = true).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";

interface InviteBody {
  email: string;
  cluster_id: string;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body.email || !body.cluster_id) {
    return jsonResponse({ error: "missing email or cluster_id" }, 400);
  }

  const supabase = adminClient();
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(jwt);
  const inviter = userData?.user?.id;
  if (!inviter) return jsonResponse({ error: "unauthorized" }, 401);

  // Verify inviter is an admin of the cluster.
  const { data: membership } = await supabase
    .from("cluster_members")
    .select("role")
    .eq("cluster_id", body.cluster_id)
    .eq("user_id", inviter)
    .single();
  if (membership?.role !== "admin") {
    return jsonResponse({ error: "forbidden: admin role required" }, 403);
  }

  const token = crypto.randomUUID().replaceAll("-", "");
  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      cluster_id: body.cluster_id,
      email: body.email,
      token,
      invited_by: inviter,
    })
    .select("id")
    .single();

  if (error || !invite) {
    return jsonResponse({ error: error?.message ?? "insert failed" }, 500);
  }

  const joinUrl = `${ENV.APP_URL()}/onboard?token=${token}`;

  // Best-effort email via Resend if configured.
  let sent = false;
  const resendKey = ENV.RESEND_API_KEY();
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "Continuum <onboarding@continuum.dev>",
          to: body.email,
          subject: "You're invited to a Continuum workspace",
          html: `<p>Join the workspace: <a href="${joinUrl}">${joinUrl}</a></p>`,
        }),
      });
      sent = res.ok;
    } catch (err) {
      console.error("resend email failed:", err);
    }
  }

  return jsonResponse({ invite_id: invite.id, sent, join_url: joinUrl });
});
