// user-onboard — Redeem an invite token: create the auth user, link them to
// the cluster, provision a Letta agent, and store the agent id on the profile.
//
// Auth: unauthenticated (token in body acts as the credential).
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { ENV } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";

interface OnboardBody {
  token: string;
  full_name: string;
  password: string;
}

// Provision a persistent Letta agent for the new user.
async function createLettaAgent(email: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.letta.com/v1/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.LETTA_API_KEY()}`,
      },
      body: JSON.stringify({
        name: `continuum-${email}`,
        memory_blocks: [
          { label: "persona", value: "I observe and summarize my user's work for the team graph." },
          { label: "human", value: `This agent belongs to ${email}.` },
        ],
      }),
    });
    if (!res.ok) {
      console.error("letta agent creation failed:", await res.text());
      return null;
    }
    const json = await res.json();
    return json.id ?? null;
  } catch (err) {
    console.error("letta agent creation error:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  let body: OnboardBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body.token || !body.full_name || !body.password) {
    return jsonResponse({ error: "missing fields" }, 400);
  }

  const supabase = adminClient();

  // Validate invite.
  const { data: invite, error: inviteErr } = await supabase
    .from("invites")
    .select("id, email, cluster_id, status")
    .eq("token", body.token)
    .single();
  if (inviteErr || !invite) {
    return jsonResponse({ error: "invalid token" }, 400);
  }
  if (invite.status !== "pending") {
    return jsonResponse({ error: "invite already used or revoked" }, 409);
  }

  // Create the auth user (profile row is created by the auth trigger).
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: invite.email,
    password: body.password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name },
  });
  if (createErr || !created?.user) {
    return jsonResponse({ error: createErr?.message ?? "user creation failed" }, 500);
  }
  const userId = created.user.id;

  // Provision Letta agent and link membership.
  const lettaAgentId = await createLettaAgent(invite.email);

  await supabase.from("profiles").update({
    full_name: body.full_name,
    letta_agent_id: lettaAgentId,
  }).eq("id", userId);

  await supabase.from("cluster_members").insert({
    cluster_id: invite.cluster_id,
    user_id: userId,
    role: "member",
  });

  await supabase.from("invites").update({ status: "accepted" }).eq("id", invite.id);

  return jsonResponse({
    onboarded: true,
    user_id: userId,
    letta_agent_id: lettaAgentId,
  });
});
