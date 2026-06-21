"""Continuum coordinator uAgent — ASI-1 Mini powered routing brain.

Receives observations (via the standardized ASI chat protocol) from teammate
device agents, asks ASI-1 Mini whether the observation is research-worthy, and
if so syncs it into the Continuum knowledge graph via the Supabase `agent-sync`
Edge Function.

Run standalone:   python coordinator_agent.py
Run with device:  python device_agent.py   (uses a Bureau, see that file)
"""

import os
import json
import ast
from datetime import datetime, timezone
from uuid import uuid4

import requests
from dotenv import load_dotenv

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatMessage,
    ChatAcknowledgement,
    TextContent,
    EndSessionContent,
    chat_protocol_spec,
)

load_dotenv()

# --- Configuration -----------------------------------------------------------
ASI_API_KEY = os.getenv("ASI_API_KEY", "")
AGENTVERSE_API_KEY = os.getenv("AGENTVERSE_API_KEY", "")
COORDINATOR_SEED = os.getenv("COORDINATOR_SEED", "continuum_coordinator_secret_seed")
CLUSTER_ID = os.getenv("CLUSTER_ID", "")
AGENT_SYNC_SECRET = os.getenv("AGENT_SYNC_SECRET", "")

# semantic_nodes.user_id is a FK to profiles(id) (a UUID). A Fetch.AI agent
# address is NOT a valid profiles UUID, so observations are attributed to a real
# seeded teammate by default (Kunj). Override per-deployment with DEMO_USER_ID.
DEMO_USER_ID = os.getenv("DEMO_USER_ID", "11111111-1111-1111-1111-111111111111")

ASI1_URL = "https://api.asi1.ai/v1/chat/completions"
AGENT_SYNC_URL = "https://sqlgrnrjtjbjvsacusxh.supabase.co/functions/v1/agent-sync"

SYSTEM_PROMPT = """You are the coordinator for Continuum, a collective \
intelligence system for research teams. You receive observations from teammate \
desktop agents about what they are working on.

When you receive an observation, respond with a JSON object in this exact format:
{
  'action': 'sync' or 'ignore',
  'reason': 'one sentence explanation',
  'topic': 'extracted topic label',
  'connections': ['teammate name if related work exists']
}

Sync if the observation is about technical research work (code, papers, \
debugging, ML concepts).
Ignore if it is about email, social media, or non-research activity.
Only respond with the JSON. Nothing else."""

# --- Agent -------------------------------------------------------------------
# mailbox=True registers the agent on Agentverse so it is reachable by ASI:One.
# The AGENTVERSE_API_KEY env var is picked up by the uagents Agentverse client
# for authenticated mailbox registration.
agent = Agent(
    name="continuum-coordinator",
    seed=COORDINATOR_SEED,
    port=8001,
    mailbox=True,
)

chat_proto = Protocol(spec=chat_protocol_spec)


# --- ASI-1 Mini --------------------------------------------------------------
def ask_asi1(observation: str) -> dict:
    """Send an observation to ASI-1 Mini and return its parsed routing decision."""
    resp = requests.post(
        ASI1_URL,
        headers={
            "Authorization": f"Bearer {ASI_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "asi1-mini",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": observation},
            ],
            "temperature": 0.2,
        },
        timeout=30,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return _parse_decision(content)


def _parse_decision(content: str) -> dict:
    """Parse ASI-1's reply into a dict, tolerating ``` fences and single quotes."""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    # Try strict JSON first, then a Python-literal parser (handles single quotes).
    for parser in (json.loads, ast.literal_eval):
        try:
            result = parser(text)
            if isinstance(result, dict):
                return result
        except Exception:
            continue
    return {
        "action": "ignore",
        "reason": "could not parse ASI-1 response",
        "topic": "",
        "connections": [],
    }


# --- Supabase sync -----------------------------------------------------------
def sync_to_continuum(sender: str, observation: str, topic: str) -> tuple[bool, str]:
    """POST the observation to the Supabase `agent-sync` Edge Function.

    Returns (ok, info) where info is the node_id on success or an error string.
    """
    payload = {
        "agent_id": sender,
        "cluster_id": CLUSTER_ID,
        "user_id": DEMO_USER_ID,
        "descriptor": {
            "app": "unknown",
            "topic": topic,
            "concept": observation,
            "error_type": None,
        },
        "letta_memory_id": None,
    }
    try:
        resp = requests.post(
            AGENT_SYNC_URL,
            headers={
                # The deployed agent-sync function authenticates on the
                # `x-continuum-secret` header. We also send Authorization: Bearer
                # (per the integration spec); it is harmless (verify_jwt=false).
                "x-continuum-secret": AGENT_SYNC_SECRET,
                "Authorization": f"Bearer {AGENT_SYNC_SECRET}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    except Exception as exc:  # noqa: BLE001 - report any transport error back
        return False, f"request error: {exc}"

    if resp.status_code == 200:
        try:
            return True, str(resp.json().get("node_id", ""))
        except Exception:
            return True, ""
    return False, f"{resp.status_code}: {resp.text[:200]}"


def _chat(text: str) -> ChatMessage:
    """Build a chat reply that carries the result text and ends the session."""
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    )


# --- Chat protocol handlers --------------------------------------------------
@chat_proto.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage):
    # Acknowledge receipt first (chat protocol requirement).
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id),
    )

    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip()
    if not text:
        return
    ctx.logger.info(f"Observation from {sender[:18]}…: {text}")

    try:
        decision = ask_asi1(text)
    except Exception as exc:  # noqa: BLE001
        ctx.logger.error(f"ASI-1 call failed: {exc}")
        await ctx.send(sender, _chat(f"[error] ASI-1 call failed: {exc}"))
        return

    action = str(decision.get("action", "ignore")).lower()
    reason = decision.get("reason", "")
    topic = decision.get("topic", "")
    connections = decision.get("connections", [])
    ctx.logger.info(f"ASI-1 → action={action} topic={topic!r} connections={connections}")

    if action == "sync":
        ok, info = sync_to_continuum(sender, text, topic)
        if ok:
            reply = f"SYNCED ✅ topic='{topic}' node_id={info} — {reason}"
        else:
            reply = f"SYNC FAILED ⚠️ ({info}) topic='{topic}' — {reason}"
    else:
        reply = f"IGNORED ⏭️  — {reason}"

    ctx.logger.info(reply)
    await ctx.send(sender, _chat(reply))


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"Ack from {sender[:18]}… for {msg.acknowledged_msg_id}")


@agent.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info("=" * 64)
    ctx.logger.info("Continuum Coordinator (ASI-1 Mini) online")
    ctx.logger.info(f"  address : {agent.address}")
    ctx.logger.info(f"  cluster : {CLUSTER_ID or '(CLUSTER_ID not set)'}")
    if not ASI_API_KEY:
        ctx.logger.warning("  ASI_API_KEY not set — ASI-1 calls will fail")
    if not AGENT_SYNC_SECRET:
        ctx.logger.warning("  AGENT_SYNC_SECRET not set — sync calls will be rejected (401)")
    ctx.logger.info("  >>> copy this address into COORDINATOR_ADDRESS in your .env")
    ctx.logger.info("=" * 64)


# publish_manifest=True so the chat protocol is advertised on Agentverse / ASI:One.
agent.include(chat_proto, publish_manifest=True)


if __name__ == "__main__":
    agent.run()
