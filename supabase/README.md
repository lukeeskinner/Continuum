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
│   ├── 0002_rpc_and_cron.sql   # Vector RPCs + pg_cron (commented)
│   ├── 0003_source_type.sql    # node source_type (SCREEN/BROWSER/VOICE/MANUAL)
│   ├── 0004_realtime.sql       # realtime publication
│   ├── 0005_hybrid_search.sql  # tsvector + GIN, keyword_match_nodes, match_nodes+created_at
│   └── 0006_embed_provenance.sql # embed_model / embed_text columns
└── functions/
    ├── _shared/                # cors, env, supabase, embeddings, redis, anthropic,
    │                           #   pipeline_config (tunable knobs), ranking (hybrid
    │                           #   fusion + decay), ingest (dedup/embed helpers)
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

## Retrieval & ingestion pipeline

Tunable knobs live in one place: `_shared/pipeline_config.ts` (env-overridable).

**Ingestion (`agent-sync`)** — FNDR-style "cheap gates before the expensive
step":

1. Rate-limit (Redis sliding window).
2. **Dedup before embedding**: skip if an identical descriptor from the same
   user landed within `INGEST_DEDUPE_WINDOW_MIN` (returns the existing node).
3. Embed via OpenAI; on failure, **store a zero vector** tagged
   `embed_model='none'` so the node stays keyword-searchable instead of 500-ing.
4. Insert with provenance (`embed_model`, `embed_text`); cache real vectors in
   Redis VSS + broadcast.

**Retrieval (`query-synthesize`)** — **hybrid** search, not vector-only:

1. Two branches run in parallel — **vector** (Redis VSS `FT.SEARCH`, falling
   back to the pgvector `match_nodes` RPC) and **keyword** (Postgres full-text
   `keyword_match_nodes` over a GIN-indexed `tsvector`).
2. `_shared/ranking.ts` fuses them with scale-free rank scoring + weights
   (`FUSION_*`) and an **Ebbinghaus recency decay** (`RECENCY_*`), drops hits
   below `RELEVANCE_FLOOR`, and keeps the top `RETRIEVAL_TOP_K` seeds.
3. The subgraph is expanded one hop and capped, then Claude Sonnet synthesizes a
   citation-aware answer (strongest fused hits first).

Where Redis Stack is unavailable (e.g. Upstash), the `match_nodes` /
`find_connection_candidates` pgvector RPCs provide the vector branch; the
keyword branch is always Postgres-native.

## Testing the pipeline

```bash
deno task test    # _shared unit tests (ranking fusion/decay, ingest dedup, …)
deno task check   # type-check every function
```
