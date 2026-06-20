# Continuum — Supabase

Postgres schema (with RLS + pgvector), and the six Deno Edge Functions that make
up Continuum's serverless backend.

## Layout

```
supabase/
├── config.toml                 # CLI config (ports, function JWT settings)
├── seed.sql                    # Local dev seed data
├── .env.example                # Edge Function secrets
├── migrations/
│   ├── 0001_initial_schema.sql # Tables, RLS, triggers
│   └── 0002_rpc_and_cron.sql   # Vector RPCs + pg_cron (commented)
└── functions/
    ├── _shared/                # cors, env, supabase, embeddings, redis, anthropic
    ├── agent-sync/             # Letta webhook → insert node + broadcast
    ├── connection-detect/      # Cron → cross-person edge discovery
    ├── query-synthesize/       # User Q&A synthesis
    ├── user-invite/            # Generate invite link/email
    ├── user-onboard/           # Redeem invite, create user + Letta agent
    └── voice-transcribe/       # Deepgram transcription
```

## Local development

```bash
# Requires the Supabase CLI + Docker.
supabase start                 # boots Postgres, applies migrations + seed
supabase db reset              # re-apply migrations + seed from scratch

# Serve functions locally:
supabase functions serve agent-sync
supabase functions serve connection-detect
supabase functions serve query-synthesize

# Set secrets for deployed functions:
supabase secrets set --env-file supabase/.env
```

## Auth model

- Client (anon/auth) access is governed by the RLS policies in `0001`.
- Edge Functions use the **service-role key** (bypasses RLS) and authenticate
  callers themselves:
  - `agent-sync` → `x-continuum-secret` header (`AGENT_SYNC_SECRET`)
  - `connection-detect` → `Authorization: Bearer <CRON_SECRET>`
  - `query-synthesize` / `user-invite` / `voice-transcribe` → Supabase JWT
  - `user-onboard` → invite token in body

## Vector search

The hot path uses Redis Stack VSS (`FT.SEARCH`). Where Redis Stack is
unavailable (e.g. Upstash), the `match_nodes` and `find_connection_candidates`
pgvector RPCs in `0002` provide an equivalent fallback.
