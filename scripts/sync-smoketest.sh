#!/usr/bin/env bash
# Smoke-test the desktop -> agent-sync -> Postgres push path against the
# deployed Supabase project, using the exact request shape the desktop sync
# worker sends. Prompts for values so no secret lands in your shell history.
#
# Needs: the PUBLIC anon key (not service_role), the AGENT_SYNC_SECRET you set
# via `supabase secrets set`, your auth user id, and a cluster you belong to.
set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-https://sqlgrnrjtjbjvsacusxh.supabase.co}"

read -r -p "Anon key (public NEXT_PUBLIC_SUPABASE_ANON_KEY): " ANON_KEY
read -r -s -p "AGENT_SYNC_SECRET: " AGENT_SYNC_SECRET; echo
read -r -p "Your USER_ID (Auth > Users): " USER_ID
read -r -p "CLUSTER_ID you're a member of: " CLUSTER_ID

payload=$(printf '{"user_id":"%s","cluster_id":"%s","descriptor":{"app":"Continuum Sync Test","topic":"sync smoke test","concept":"verifying desktop to agent-sync to db path","error_type":null}}' "$USER_ID" "$CLUSTER_ID")

echo "POST ${SUPABASE_URL}/functions/v1/agent-sync"
status=$(curl -sS -o /tmp/continuum_synctest_body.json -w '%{http_code}' \
  -X POST "${SUPABASE_URL}/functions/v1/agent-sync" \
  -H "apikey: ${ANON_KEY}" \
  -H "x-continuum-secret: ${AGENT_SYNC_SECRET}" \
  -H "content-type: application/json" \
  -d "$payload")

echo "HTTP ${status}"
cat /tmp/continuum_synctest_body.json; echo
echo "----"
case "$status" in
  200) echo "RESULT: SYNC OK. agent-sync inserted a node (see node_id above). If you are a member of ${CLUSTER_ID}, it shows on the web Live graph immediately." ;;
  401) echo "RESULT: 401 unauthorized. AGENT_SYNC_SECRET is wrong or not set on the Supabase project (the secret here must equal the supabase-secrets value)." ;;
  403) echo "RESULT: 403 forbidden. (Only happens on the JWT path / membership check.)" ;;
  400) echo "RESULT: 400 bad request. Check USER_ID and CLUSTER_ID are valid UUIDs that exist." ;;
  5*)  echo "RESULT: ${status} server error. Likely a missing function secret (OPENAI_API_KEY / REDIS_URL / SUPABASE_SERVICE_ROLE_KEY)." ;;
  *)   echo "RESULT: unexpected status ${status}." ;;
esac
