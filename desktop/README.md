# Continuum Desktop Agent

Ambient Electron agent that captures screen context, extracts a structured
descriptor with Anthropic Claude vision, applies a privacy/PII filter, and
syncs approved observations into the team knowledge graph.

## Layout

```
desktop/
├── electron/             # Main process
│   ├── main.js           # Lifecycle, capture loop, tray, query bar, orchestration
│   ├── env.js            # Dependency-free .env loader
│   ├── config.js         # Env-backed config
│   ├── supabase.js       # Supabase client (file-persisted session)
│   ├── auth.js           # Sign-in + identity (user / cluster / Letta agent)
│   ├── sidecar.js        # Python subprocess bridge (JSON over stdio)
│   ├── capturePolicy.js  # Pure pipeline logic: perceptual hash, idle cadence, dedup
│   ├── frontApp.js       # macOS frontmost-app bundle id (lsappinfo, no a11y prompt)
│   ├── privacy.js        # BLOCKED / LOCAL_ONLY / SHARED_ANON classifier + scrubber
│   ├── store.js          # Local SQLite buffer (sql.js): durable, offline-safe
│   ├── letta.js          # Letta Cloud REST client (per-user memory + query)
│   ├── queryEngine.js    # Query bar backend: query-synthesize + local-memory fallback
│   ├── sync.js           # Direct agent-sync push (graph node)
│   ├── browserbase.js    # Opt-in URL enrichment trigger
│   ├── hub.js            # Web hub client (query-synthesize + Deepgram voice)
│   ├── realtime.js       # Inbound team activity (teammates' nodes / connections)
│   └── preload.js        # Secure renderer bridge
├── renderer/             # Login window, status overlay, query (Spotlight) bar
├── sidecar/              # Python Anthropic Claude vision sidecar
└── assets/               # Tray icon
```

## Setup

```bash
cd desktop
cp .env.example .env        # fill in Supabase + Letta + Anthropic values
npm install                 # Electron + supabase-js
npm run sidecar:setup       # create venv + install anthropic deps
```

`.env` is loaded automatically at startup (`electron/env.js`) — no need to
export anything into your shell. Real environment variables take precedence over
`.env`, so CI/shell overrides still work.

Minimum config for the graph sync to work: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_FUNCTIONS_URL`, `AGENT_SYNC_SECRET`, and `ANTHROPIC_API_KEY` for
vision. `LETTA_*` is optional (per-user memory). `CONTINUUM_USER_ID` /
`CONTINUUM_CLUSTER_ID` are only fallbacks — normally they're resolved from the
signed-in user's profile.

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

The capture loop is **idle-aware and self-scheduling** (not a fixed interval),
with cheap gates ahead of every paid vision call (`capturePolicy.js` holds the
pure decision logic; `main.js` wires Electron to it):

1. **Adaptive cadence.** `powerMonitor.getSystemIdleTime()` drives the delay:
   `CAPTURE_INTERVAL_MS` while active, stretched toward `IDLE_CAPTURE_INTERVAL_MS`
   once idle past `IDLE_PAUSE_SECONDS`, and **no capture at all** past
   `DEEP_IDLE_SECONDS` (just a light poll for the user's return). A single-flight
   guard + exponential backoff (`MAX_BACKOFF_MS`) keep slow/erroring inference
   from piling up.
2. **Perceptual dedup.** The frame is downscaled to an 8×8 grayscale **average
   hash**; visually-unchanged frames (Hamming ≤ `HASH_HAMMING_THRESHOLD`),
   including A→B→A flips, are skipped before any paid call.
3. **Pre-vision privacy gate.** `frontApp.getFrontmost()` resolves the focused
   app's macOS **bundle id** (via `lsappinfo`, no Accessibility prompt); if it's
   on the block list the frame is dropped **before** the vision call — a blocked
   app's screen never leaves the device.
4. **Vision.** The surviving frame (base64 PNG) is piped to `sidecar/sidecar.py`,
   which calls Anthropic Claude vision (`ANTHROPIC_API_KEY`, `CONTINUUM_MODEL`)
   and returns `{ app, topic, concept, error_type }`. Auto-restart + per-request
   timeout.
5. **Semantic dedup.** Identical descriptors (app + topic + concept) within
   `SEMANTIC_DEDUP_WINDOW_MS` are skipped, with a forced refresh every
   `SEMANTIC_FORCE_REFRESH_MS` so long-lived contexts still produce a heartbeat.
6. **Classify + route.** `privacy.classify(descriptor, { bundleId, appName,
   privateMode })` (keyword + Private Mode backstop) labels it:
   - **BLOCKED** — dropped; never stored or sent.
   - **LOCAL_ONLY** — buffered locally + posted to the user's own Letta agent;
     never pushed to the team graph.
   - **SHARED_ANON** — scrubbed, buffered locally, posted to Letta, **and** pushed
     to the team graph.
7. **Buffer + sync.** Every non-BLOCKED observation is written to the local
   SQLite buffer (`store.js`, sql.js). For SHARED_ANON, `sync.pushNode()` posts to
   the `agent-sync` Edge Function (embeds, inserts a `semantic_nodes` row,
   broadcasts to the dashboard). On success the row is marked synced; on failure
   it stays queued and `flushUnsynced()` retries every ~20s — offline durability.
8. Allowlisted URLs (`BROWSERBASE_DOMAINS`) trigger `browserbase-enrich` for a
   richer BROWSER-sourced node.

## Query bar & privacy controls

- **Ask Continuum** — a Spotlight-style command bar toggled by a global shortcut
  (`QUERY_SHORTCUT`, default `Cmd/Ctrl+Shift+Space`), with push-to-talk voice
  (Deepgram via the hub). It queries the team graph through `query-synthesize`
  (`query:ask` → `query:response`); if the hub is unreachable it falls back to a
  deterministic summary of the local on-device buffer, so it always answers.
- **Private Mode** — toggle from the overlay or the tray (`privacy:toggle`).
  While on, nothing is classified `SHARED_ANON`, so no new observations reach the
  team graph (`BLOCKED` still applies).

## Tests

```bash
npm test                          # unit tests (env, privacy, store, letta, frontApp, queryEngine, browserbase)
node ../scripts/test-sidecar.js   # sidecar stdin/stdout contract
```

## Packaging

```bash
npm run dist        # current platform
npm run dist:mac    # dmg
npm run dist:win    # nsis
```

The Python sidecar is bundled as an extra resource. The packaged app expects a
system `python3` with the sidecar deps available (or bundle a venv). The sql.js
WebAssembly file is unpacked from the asar (`build.asarUnpack`) so `store.js`
can load it at runtime.
