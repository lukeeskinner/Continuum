# Continuum Desktop Agent

Ambient Electron agent that captures screen context, extracts a structured
descriptor with a local moondream2 vision model, applies a privacy/PII filter,
and syncs approved observations to the user's Letta agent.

## Layout

```
desktop/
├── electron/        # Main process
│   ├── main.js      # Capture loop + orchestration
│   ├── config.js    # Env-backed config
│   ├── sidecar.js   # Python subprocess bridge (JSON over stdio)
│   ├── privacy.js   # BLOCKED / LOCAL_ONLY / SHARED_ANON classifier + scrubber
│   ├── letta.js     # Letta Cloud REST client
│   └── preload.js   # Secure renderer bridge
├── renderer/        # Glassmorphic status overlay
└── sidecar/         # Python moondream2 vision sidecar
```

## Setup

```bash
cd desktop
cp .env.example .env        # fill in Letta + identity values
npm install                 # Electron
npm run sidecar:setup       # create venv + install moondream2 deps
```

## Run

```bash
# load .env into your shell, then:
npm start
```

## Pipeline

1. `desktopCapturer` grabs a thumbnail frame; a cheap signature check skips
   unchanged frames (`FRAME_DELTA_THRESHOLD`).
2. The frame (base64 PNG) is piped to `sidecar/sidecar.py` which runs moondream2
   and returns `{ app, topic, concept, error_type }`.
3. `privacy.classify()` labels the descriptor:
   - **BLOCKED** — dropped.
   - **LOCAL_ONLY** — sent to Letta, not promoted to the shared graph.
   - **SHARED_ANON** — scrubbed of identity details, then sent to Letta.
4. Letta's archival webhook (`agent-sync`) promotes insights to the shared graph.
