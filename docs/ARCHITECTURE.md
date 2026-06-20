# Continuum — Architecture

Continuum is a real-time, cross-person organizational knowledge graph. It
ambiently captures teammate activity using local vision, updates a persistent
per-user Letta agent, syncs shared knowledge to a vector-enabled database, and
synthesizes relationships (`RELATED_TO`, `BUILDS_ON`, `CONTRADICTS`) across
teammates.

## Technology choices

| Technology | Role |
| :--- | :--- |
| Next.js + Tailwind | Dashboard (SSR, D3 visualization, Vercel hosting). |
| Supabase | Postgres + RLS + serverless Deno Edge Functions. |
| Redis Stack | Pub/sub, rate limiting, Vector Similarity Search (`FT.SEARCH`). |
| Letta Cloud | Persistent per-user memory agents. |
| Electron + Node | Desktop capture, sidecar lifecycle, Letta posting. |
| moondream2 | On-device vision-language model (privacy + cost). |
| Deepgram | Voice query transcription. |
| Claude Haiku / Sonnet | Relationship classification / citation-aware synthesis. |

## 1. Web dashboard (`web/continuum`)

- D3 force-directed graph (`components/GraphCanvas.tsx`) — nodes color-coded by
  teammate, draggable, click-to-inspect.
- Query sidebar (`components/QuerySidebar.tsx`) — text/voice questions to
  `query-synthesize`.
- Realtime via SSE (`app/api/events/route.ts`) subscribing to the Redis
  `cluster:{id}:events` channel and animating new nodes/edges.

## 2. Desktop agent (`desktop`)

```
Electron Main ──capture delta──> Python Sidecar (moondream2) ──descriptor──> Privacy Filter
     │                                                                            │
     └────────────────────────── Letta Cloud <── approved (LOCAL_ONLY/SHARED_ANON)┘
```

- `desktopCapturer` grabs frames only on visual deltas.
- Sidecar emits `{ app, topic, concept, error_type }`.
- Privacy filter: **BLOCKED** (drop) / **LOCAL_ONLY** (Letta only) /
  **SHARED_ANON** (scrub identity → Letta → shared graph).

## 3. Backend (`supabase`)

Serverless: Postgres (with pgvector), Redis Stack, Letta Cloud, and six Edge
Functions.

### Data model

See [`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql):
`profiles`, `clusters`, `cluster_members`, `semantic_nodes` (with `VECTOR(1536)`),
`semantic_edges`, `invites` — all RLS-isolated per cluster.

### Redis keys

| Key | Type | TTL | Purpose |
| :--- | :--- | :--- | :--- |
| `ratelimit:user:{id}:min` | String | 60s | Sliding-window rate limit. |
| `cluster:{id}:events` | Pub/Sub | — | Realtime graph mutations. |
| `node:{id}` | Hash | none | Node cache + VSS index source. |

Index: `FT.CREATE idx:nodes ON HASH PREFIX 1 node: SCHEMA cluster_id TAG embedding VECTOR FLAT 6 TYPE FLOAT32 DIM 1536 DISTANCE_METRIC COSINE`.

## 4. Edge Function contract

| Function | Trigger | Auth |
| :--- | :--- | :--- |
| `agent-sync` | Letta archival webhook | `x-continuum-secret` |
| `connection-detect` | pg_cron (5 min) | `Bearer CRON_SECRET` |
| `query-synthesize` | Dashboard Q&A | Supabase JWT |
| `user-invite` | Manager invites teammate | Supabase JWT (admin) |
| `user-onboard` | Redeem invite | Invite token |
| `voice-transcribe` | Voice query | Supabase JWT |

## 5. End-to-end flows

1. **Observation** — capture → moondream2 → privacy → Letta → `agent-sync` →
   embed + insert node (Postgres + Redis) → broadcast → dashboard animates node.
2. **Connection detection** — `connection-detect` finds cross-person pairs with
   cosine similarity > 0.82, classifies via Claude Haiku, inserts edges,
   broadcasts.
3. **Query** — (voice → `voice-transcribe`) → rate-limit → embed → KNN top-20 →
   subgraph expansion (≤40) → Claude Sonnet citation-aware answer → highlight.

## Cost controls ($25 Claude budget)

- Local vision (moondream2) — no cloud vision spend.
- Delta-only screen capture — fewer agent requests.
- Anthropic prompt caching on `query-synthesize` / `connection-detect`.
- Optional Batch API for the non-urgent cron classification.
- Redis 50k tokens/min rate limit guards against runaway loops.

## Deviations from the original plan

- Next.js **16.2.9** (not 14) — App Router + Route Handlers.
- Claude aliases `claude-haiku-4-5` / `claude-sonnet-4-5` (no "Sonnet 4.6").
- Redis VSS requires Redis Stack; a pgvector fallback (`match_nodes`,
  `find_connection_candidates`) covers Upstash-style deployments.
