"""Continuum vision sidecar (Anthropic Claude).

Reads newline-delimited JSON frames from stdin, sends each frame to Claude
vision, and writes a structured descriptor JSON to stdout.

Protocol:
    stdin  -> {"frame": "<base64 png>"}
    stdout <- {"app": str, "topic": str, "concept": str, "error_type": str|null}

One descriptor line per input line — keeps the Electron ordered queue in sync.
On failure emits an empty descriptor instead of crashing.
"""

import base64
import json
import os
import sys

try:
    from dotenv import load_dotenv
    _here = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_here, "..", ".env"))
except Exception:
    pass

MODEL = os.environ.get("CONTINUUM_MODEL", "claude-haiku-4-5-20251001")

PROMPT = (
    "Look at this screenshot and identify what the user is working on. "
    "Reply with ONLY a JSON object using these exact keys:\n"
    '{"app": "focused application name", '
    '"topic": "main topic in one short phrase", '
    '"concept": "key technical concept visible", '
    '"error_type": "error type if any visible, otherwise null"}\n'
    "No markdown fences, no explanation. JSON only."
)

EMPTY = {"app": "Unknown", "topic": "", "concept": "", "error_type": None}

_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic()
    return _client


def _media_type(raw: bytes) -> str:
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def _coerce(answer: str) -> dict:
    try:
        start = answer.find("{")
        end = answer.rfind("}") + 1
        parsed = json.loads(answer[start:end])
    except (ValueError, json.JSONDecodeError):
        return {"app": "Unknown", "topic": "", "concept": answer.strip()[:200], "error_type": None}
    return {
        "app": parsed.get("app") or "Unknown",
        "topic": parsed.get("topic") or "",
        "concept": parsed.get("concept") or "",
        "error_type": parsed.get("error_type"),
    }


def _process(frame_b64: str) -> dict:
    raw = base64.b64decode(frame_b64)
    resp = _get_client().messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": _media_type(raw),
                        "data": frame_b64,
                    },
                },
                {"type": "text", "text": PROMPT},
            ],
        }],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    return _coerce(text)


def main() -> None:
    print(f"[sidecar] ready (model={MODEL})", file=sys.stderr, flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            descriptor = _process(msg["frame"])
        except Exception as exc:
            print(f"[sidecar] error: {exc}", file=sys.stderr, flush=True)
            descriptor = dict(EMPTY)
        sys.stdout.write(json.dumps(descriptor) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
