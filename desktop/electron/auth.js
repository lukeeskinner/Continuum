// Desktop authentication + identity resolution.
//
// After the user signs in with their Supabase credentials, we resolve the
// identity the capture pipeline needs: the user id, their active cluster, and
// the Letta agent provisioned for them during onboarding.
const { supabase } = require("./supabase");

async function isAuthenticated() {
  const { data } = await supabase().auth.getSession();
  return Boolean(data.session);
}

async function signIn(email, password) {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return getIdentity();
}

async function signOut() {
  await supabase().auth.signOut();
}

// Resolve { userId, clusterId, lettaAgentId } for the signed-in user.
async function getIdentity() {
  const sb = supabase();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user) throw new Error("not signed in");
  const userId = userData.user.id;

  const { data: profile } = await sb
    .from("profiles")
    .select("letta_agent_id")
    .eq("id", userId)
    .single();

  const { data: membership } = await sb
    .from("cluster_members")
    .select("cluster_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .single();

  return {
    userId,
    clusterId: membership?.cluster_id ?? "",
    lettaAgentId: profile?.letta_agent_id ?? "",
  };
}

module.exports = { isAuthenticated, signIn, signOut, getIdentity };
