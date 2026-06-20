# Continuum Desktop Agent

Ambient Electron agent that captures screen context, extracts a structured
descriptor with a local moondream2 vision model, applies a privacy/PII filter,
and syncs approved observations into the team knowledge graph.

## Layout

```
desktop/
├── electron/             # Main process
│   ├── main.js           # Lifecycle, capture loop, tray, orchestration
│   ├── env.js            # Dependency-free .env loader
│   ├── config.js         # Env-backed config
│   ├── supabase.js       # Supabase client (file-persisted session)
│   ├── auth.js           # Sign-in + identity (user / cluster / Letta agent)
│   ├── sidecar.js        # Python subprocess bridge (JSON over stdio)
│   ├── dedupe.js         # Perceptual-hash + fingerprint frame deduplication
│   ├── admission.js      # Capture-surface policy (skip new-tab/search/feed pages)
│   ├── ocr.js            # Local text extraction (tesseract.js)
│   ├── privacy.js        # BLOCKED / LOCAL_ONLY / SHARED_ANON classifier + scrubber
│   ├── letta.js          # Letta Cloud REST client (per-user memory)
│   ├── sync.js           # Direct agent-sync push (graph node)
│   ├── browserbase.js    # Opt-in URL enrichment trigger
│   └── preload.js        # Secure renderer bridge
├── renderer/             # Login window + glassmorphic status overlay
├── sidecar/              # Python moondream2 vision sidecar
└── assets/               # Tray icon
```

## Setup

```bash
cd desktop
cp .env.example .env        # fill in Supabase + Letta values
npm install                 # Electron + supabase-js
npm run sidecar:setup       # create venv + install moondream2 deps
```

`.env` is loaded automatically at startup (`electron/env.js`) — no need to
export anything into your shell. Real environment variables take precedence over
`.env`, so CI/shell overrides still work.

Minimum config for the graph sync to work: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_FUNCTIONS_URL`, `AGENT_SYNC_SECRET`. `LETTA_*` is optional (per-user
memory). `CONTINUUM_USER_ID` / `CONTINUUM_CLUSTER_ID` are only fallbacks —
normally they're resolved from the signed-in user's profile.

## Run

```bash
npm start
```

On first launch you'll get a sign-in window (Supabase credentials). After
sign-in the agent resolves your identity, starts the sidecar, and lives in the
system tray (no dock icon on macOS).

**macOS:** screen capture needs Screen Recording permission. The app detects a
missing grant, opens the relevant System Settings pane, and starts capturing
automatically once you grant it.

## Pipeline

1. `admission.classifyCaptureSurfacePolicy()` checks the active window/app
   (via `active-win`) and skips the frame entirely for generic browser
   surfaces (new tab, search results, feeds) before paying for a capture.
2. `desktopCapturer` grabs a thumbnail frame; `dedupe.js` (perceptual-hash +
   exact-fingerprint + short-history alternating-pattern check, ported from
   FNDR's `dedupe.rs`) drops frames that are duplicates or near-duplicates of
   recent frames (`HASH_DISTANCE_THRESHOLD`). A single-flight guard prevents
   overlapping inference when the model is slow.
3. The frame (base64 PNG) is piped to `sidecar/sidecar.py` (runs moondream2,
   returns `{ app, topic, concept, error_type }`) and, in parallel, through
   `ocr.js` (tesseract.js) for local text extraction merged into the
   descriptor as `ocr_text`. The sidecar auto-restarts if it dies, and each
   request has a timeout.
4. `privacy.classify()` labels the descriptor (including any `ocr_text`):
   - **BLOCKED** — dropped on-device, never leaves the machine.
   - **LOCAL_ONLY** — sent to the user's Letta agent only.
   - **SHARED_ANON** — scrubbed of identity details, sent to Letta **and** pushed
     to the team graph.
5. For `SHARED_ANON`, `sync.pushNode()` posts the structured descriptor to the
   `agent-sync` Edge Function (deterministic), which embeds it (now including
   `ocr_text`), inserts a `semantic_nodes` row, and broadcasts it to the
   dashboard over Redis pub/sub.
6. If the observation references an allowlisted URL (`BROWSERBASE_DOMAINS`),
   `browserbase.enrich()` triggers `browserbase-enrich` to add a richer
   BROWSER-sourced node.

## Tests

```bash
npm test                          # unit tests (env, privacy, browserbase)
node ../scripts/test-sidecar.js   # sidecar stdin/stdout contract
```

## Packaging

```bash
npm run dist        # current platform
npm run dist:mac    # dmg
npm run dist:win    # nsis
```

The Python sidecar is bundled as an extra resource. The packaged app expects a
system `python3` with the sidecar deps available (or bundle a venv).
