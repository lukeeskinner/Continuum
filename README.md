# Continuum

Real-time, cross-person organizational knowledge graph. Continuum ambiently
captures teammate activity using on-device vision, maintains a persistent
per-user Letta agent, syncs shared knowledge to Postgres + a vector store, and
synthesizes relationships (`RELATED_TO`, `BUILDS_ON`, `CONTRADICTS`) across
teammates.

## Monorepo layout

```
.
├── web/continuum/   # Next.js dashboard (D3 force graph + query sidebar + SSE)
├── desktop/         # Electron agent + Python moondream2 vision sidecar
├── supabase/        # Postgres schema/RLS migrations + 6 Edge Functions
└── scripts/         # Dev utilities (Redis VSS smoke test, etc.)
```

## Components

| Area | Path | Stack |
| :--- | :--- | :--- |
| Dashboard | `web/continuum` | Next.js 16, Tailwind, `@supabase/supabase-js`, `ioredis`, `d3` |
| Desktop agent | `desktop` | Electron 32, Node 20, Python (moondream2) |
| Backend | `supabase` | Postgres + pgvector, Deno Edge Functions, Redis Stack (VSS) |

## Quick start

Each subproject has its own README / env example:

- **Web**: `cd web/continuum && cp .env.local.example .env.local && npm install && npm run dev`
- **Desktop**: see [`desktop/README.md`](desktop/README.md)
- **Supabase**: see [`supabase/README.md`](supabase/README.md)

## Architecture

See the full design in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Data flows

- **Observation**: desktop capture → moondream2 → privacy filter → Letta agent →
  `agent-sync` Edge Function → Postgres/Redis node → SSE broadcast → dashboard.
- **Connection detection**: `connection-detect` cron finds cross-person
  high-similarity node pairs, classifies them with Claude Haiku, writes edges.
- **Query**: dashboard → (`voice-transcribe`) → `query-synthesize` → embed →
  vector KNN → subgraph expansion → Claude Sonnet citation-aware answer.

## Notes / deviations from the original plan

- Next.js is **16.2.9** here (the plan said 14); App Router + Route Handlers are
  used accordingly.
- Claude model aliases: `claude-haiku-4-5` / `claude-sonnet-4-5` (the plan's
  "Sonnet 4.6" is not a released model).
- Redis VSS (`FT.CREATE`/`FT.SEARCH`) requires **Redis Stack / Redis Cloud**.
  Upstash does not support the search module, so a pgvector fallback
  (`match_nodes` / `find_connection_candidates` RPCs) is provided.
