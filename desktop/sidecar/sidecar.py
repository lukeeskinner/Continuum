"""Continuum local vision sidecar.

Reads newline-delimited JSON frames from stdin, runs moondream2 locally to
produce a structured descriptor, and writes the descriptor JSON to stdout.

Protocol:
    stdin  -> {"frame": "<base64 png>"}
    stdout <- {"app": str, "topic": str, "concept": str, "error_type": str|null}

moondream2 is loaded lazily so the process starts fast; if model deps are not
installed, the sidecar falls back to an empty descriptor so the pipeline still
runs end-to-end during development.
"""

import base64
import io
import json
import sys

_model = None
_tokenizer = None


def _load_model():
    """Lazily load moondream2 via transformers. Returns (model, tokenizer)."""
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


def _describe(image) -> dict:
    """Run moondream2 and coerce its answer into our descriptor schema."""
    model, tokenizer = _load_model()
    enc = model.encode_image(image)
    prompt = (
        "Describe the application in use and the technical topic on screen. "
        "Reply as JSON with keys app, topic, concept, error_type."
    )
    answer = model.answer_question(enc, prompt, tokenizer)
    try:
        parsed = json.loads(answer)
        return {
            "app": parsed.get("app", "Unknown"),
            "topic": parsed.get("topic", ""),
            "concept": parsed.get("concept", ""),
            "error_type": parsed.get("error_type"),
        }
    except (json.JSONDecodeError, AttributeError):
        # moondream returned freeform text; stash it in concept.
        return {"app": "Unknown", "topic": "", "concept": answer, "error_type": None}


def _process(frame_b64: str) -> dict:
    from PIL import Image

    raw = base64.b64decode(frame_b64)
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    return _describe(image)


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
            descriptor = {"app": "Unknown", "topic": "", "concept": "", "error_type": None}
        sys.stdout.write(json.dumps(descriptor) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
