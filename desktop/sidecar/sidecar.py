"""Continuum vision sidecar.

Reads newline-delimited JSON frames from stdin, sends them to Moondream Cloud
(https://moondream.ai) when MOONDREAM_API_KEY is configured, and writes a
structured descriptor JSON line to stdout.

Protocol:
    stdin  -> {"frame": "<base64 png>"}
    stdout <- {"app": str, "topic": str, "concept": str, "error_type": str|null}

If MOONDREAM_API_KEY is absent or the cloud call fails, the sidecar falls back to
a local moondream2 model when its dependencies are installed. If neither path is
available, it emits an empty descriptor so the desktop pipeline keeps running in
development.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any

_model: Any = None
_tokenizer: Any = None

MOONDREAM_API_BASE = os.getenv("MOONDREAM_API_BASE", "https://api.moondream.ai/v1").rstrip("/")
MOONDREAM_TIMEOUT_S = float(os.getenv("MOONDREAM_TIMEOUT_S", "30"))
DESCRIPTOR_KEYS = ("app", "topic", "concept", "error_type")
DESCRIPTOR_PROMPT = (
    "You are the visual intelligence layer for an ambient desktop knowledge graph. "
    "Analyze this screenshot and identify the application or website, the technical "
    "topic, the core concept/work being shown, and any visible error type. "
    "Return ONLY valid compact JSON with keys: app, topic, concept, error_type. "
    "Use null for error_type when there is no visible error. Do not include markdown."
)


def _empty_descriptor() -> dict:
    return {"app": "Unknown", "topic": "", "concept": "", "error_type": None}


def _coerce_descriptor(value) -> dict:
    """Coerce a JSON object or freeform model answer into the descriptor schema."""
    if isinstance(value, str):
        text = value.strip()
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, flags=re.DOTALL)
            if match:
                try:
                    value = json.loads(match.group(0))
                except json.JSONDecodeError:
                    value = None
            else:
                value = None
        if value is None:
            out = _empty_descriptor()
            out["concept"] = text
            return out

    if not isinstance(value, dict):
        return _empty_descriptor()

    return {
        "app": str(value.get("app") or "Unknown"),
        "topic": str(value.get("topic") or ""),
        "concept": str(value.get("concept") or ""),
        "error_type": value.get("error_type") or None,
    }


def _describe_with_cloud(frame_b64: str) -> dict:
    """Run Moondream Cloud VQA via https://api.moondream.ai/v1/query."""
    api_key = os.getenv("MOONDREAM_API_KEY")
    if not api_key:
        raise RuntimeError("MOONDREAM_API_KEY is not configured")

    payload = json.dumps(
        {
            "image_url": f"data:image/png;base64,{frame_b64}",
            "question": DESCRIPTOR_PROMPT,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{MOONDREAM_API_BASE}/query",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Moondream-Auth": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=MOONDREAM_TIMEOUT_S) as resp:  # noqa: S310 - fixed HTTPS API by default
        body = json.loads(resp.read().decode("utf-8"))
    return _coerce_descriptor(body.get("answer", body))


def _load_local_model():
    """Lazily load local moondream2 via transformers. Returns (model, tokenizer)."""
    global _model, _tokenizer
    if _model is not None:
        return _model, _tokenizer
    from transformers import AutoModelForCausalLM, AutoTokenizer

    model_id = "vikhyatk/moondream2"
    revision = "2024-08-26"
    _model = AutoModelForCausalLM.from_pretrained(
        model_id, trust_remote_code=True, revision=revision
    )
    _tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
    return _model, _tokenizer


def _describe_with_local_model(image) -> dict:
    """Run local moondream2 and coerce its answer into our descriptor schema."""
    model, tokenizer = _load_local_model()
    enc = model.encode_image(image)
    answer = model.answer_question(enc, DESCRIPTOR_PROMPT, tokenizer)
    return _coerce_descriptor(answer)


def _process(frame_b64: str) -> dict:
    from PIL import Image

    raw = base64.b64decode(frame_b64)
    image = Image.open(io.BytesIO(raw)).convert("RGB")

    try:
        return _describe_with_cloud(frame_b64)
    except (RuntimeError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"[sidecar] moondream cloud unavailable: {exc}", file=sys.stderr, flush=True)

    try:
        return _describe_with_local_model(image)
    except Exception as exc:  # noqa: BLE001 - fallback keeps the pipe alive
        print(f"[sidecar] local moondream unavailable: {exc}", file=sys.stderr, flush=True)
        return _empty_descriptor()


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            descriptor = _process(msg["frame"])
        except Exception as exc:  # noqa: BLE001 - keep the pipe alive
            print(f"[sidecar] error: {exc}", file=sys.stderr, flush=True)
            descriptor = _empty_descriptor()
        sys.stdout.write(json.dumps(descriptor, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
