"""Continuum device uAgent — simulated teammate desktop agent.

In production Abrham's Electron app would run this; for the demo it emits fake
research observations to the coordinator every 30 seconds and prints whatever
the coordinator replies.

Run BOTH agents together (recommended for the demo):
    python device_agent.py
This file owns the Bureau, so it boots the coordinator + device in one process.
The coordinator can still be run on its own via `python coordinator_agent.py`.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv

from uagents import Agent, Bureau, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatMessage,
    ChatAcknowledgement,
    TextContent,
    EndSessionContent,
    chat_protocol_spec,
)

load_dotenv()

# Rotating demo observations (research-y ones should be SYNCED by the coordinator).
OBSERVATIONS = [
    "Debugging transformer attention head failure in long-context window - "
    "SLURM job keeps collapsing at 8k tokens",
    "Reading paper on retrieval head failure modes in large language models",
    "Writing eval harness to measure attention degradation across context lengths",
    "Reviewing positional encoding approaches for extended context",
]

device = Agent(
    name="continuum-device-demo",
    seed=os.getenv("DEVICE_SEED", "continuum_device_demo_seed"),
    port=8002,
    mailbox=True,
)

chat_proto = Protocol(spec=chat_protocol_spec)


@device.on_event("startup")
async def on_startup(ctx: Context):
    ctx.logger.info("=" * 64)
    ctx.logger.info("Continuum Device (demo) online")
    ctx.logger.info(f"  address     : {device.address}")
    ctx.logger.info(f"  coordinator : {os.getenv('COORDINATOR_ADDRESS') or '(COORDINATOR_ADDRESS not set)'}")
    ctx.logger.info("=" * 64)


@device.on_interval(period=30.0)
async def send_observation(ctx: Context):
    target = os.getenv("COORDINATOR_ADDRESS", "")
    if not target:
        ctx.logger.warning("COORDINATOR_ADDRESS not set — skipping this send")
        return

    idx = ctx.storage.get("idx") or 0
    text = OBSERVATIONS[idx % len(OBSERVATIONS)]
    ctx.storage.set("idx", idx + 1)

    ctx.logger.info(f"→ sending observation #{idx + 1}: {text}")
    await ctx.send(
        target,
        ChatMessage(
            timestamp=datetime.now(timezone.utc),
            msg_id=uuid4(),
            content=[TextContent(type="text", text=text)],
        ),
    )


@chat_proto.on_message(ChatMessage)
async def handle_reply(ctx: Context, sender: str, msg: ChatMessage):
    # Acknowledge the coordinator's reply.
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id),
    )
    for c in msg.content:
        if isinstance(c, TextContent):
            ctx.logger.info("=" * 64)
            ctx.logger.info(f"📥 COORDINATOR REPLY: {c.text}")
            ctx.logger.info("=" * 64)
        elif isinstance(c, EndSessionContent):
            ctx.logger.info("(coordinator ended the session)")


@chat_proto.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"Ack from {sender[:18]}…")


device.include(chat_proto, publish_manifest=True)


if __name__ == "__main__":
    # Boot the coordinator + device together so the demo works end-to-end.
    from coordinator_agent import agent as coordinator_agent

    # Auto-wire device → coordinator when COORDINATOR_ADDRESS isn't set in .env.
    if not os.getenv("COORDINATOR_ADDRESS"):
        os.environ["COORDINATOR_ADDRESS"] = coordinator_agent.address

    bureau = Bureau()
    bureau.add(coordinator_agent)
    bureau.add(device)

    print("=" * 64)
    print("Continuum × Fetch.AI demo — coordinator + device in one Bureau")
    print(f"  coordinator : {coordinator_agent.address}")
    print(f"  device      : {device.address}")
    print(f"  sending to  : {os.environ.get('COORDINATOR_ADDRESS')}")
    print("=" * 64)

    bureau.run()
