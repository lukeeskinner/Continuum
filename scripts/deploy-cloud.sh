#!/usr/bin/env bash
# Deploy Continuum's cloud backend to the shared Supabase project.
#
# Applies pending migrations (adds clusters.join_code, realtime, hybrid search,
# embed provenance) and (re)deploys the Edge Functions the desktop + web call.
# Idempotent — safe to re-run.
#
# Auth: run `supabase login` first (opens a browser), or export
# SUPABASE_ACCESS_TOKEN=sbp_...  The DB password for `db push`/`link` is
# prompted unless SUPABASE_DB_PASSWORD is set.
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

PROJECT_REF="sqlgrnrjtjbjvsacusxh"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Checking Supabase auth"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ] && ! supabase projects list >/dev/null 2>&1; then
  echo "Not logged in. Run 'supabase login' (or export SUPABASE_ACCESS_TOKEN=sbp_...) and re-run." >&2
  exit 1
fi

echo "==> Linking project $PROJECT_REF (will prompt for the DB password)"
supabase link --project-ref "$PROJECT_REF"

echo "==> Applying pending migrations (0004-0007; all additive)"
supabase db push

echo "==> (Re)deploying Edge Functions the clients depend on"
supabase functions deploy cluster-create cluster-join voice-speak query-synthesize agent-sync

echo
echo "==> Done. Verify required secrets are set on the project:"
echo "      supabase secrets list"
echo "    Required: ANTHROPIC_API_KEY, OPENAI_API_KEY, AGENT_SYNC_SECRET"
echo "    Set any missing with: supabase secrets set KEY=value"
echo
echo "==> Then in the Supabase dashboard -> Authentication, confirm email OTP"
echo "    delivery is enabled, or sign-in codes won't arrive."
