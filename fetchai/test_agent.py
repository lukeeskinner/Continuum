import os

from datetime import datetime
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI
from uagents import Context, Protocol, Agent
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

subject_matter = "collective intelligence for research teams, transformer attention, knowledge graphs, and cross-person research connections"

load_dotenv()

client = OpenAI(
    base_url="https://api.asi1.ai/v1",
    api_key=os.getenv("ASI_API_KEY"),
)

agent = Agent(
    name="continuum-coordinator",
    seed="continuum_coordinator_berkeley_2026",
    port=8001,
    mailbox=True,
    publish_agent_details=True,
)

protocol = Protocol(spec=chat_protocol_spec)


@protocol.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(),
            acknowledged_msg_id=msg.msg_id
        ),
    )
    text = ""
    for item in msg.content:
        if isinstance(item, TextContent):
            text += item.text

    response = "Something went wrong, unable to answer right now"
    try:
        r = client.chat.completions.create(
            model="asi1-mini",
            messages=[
                {"role": "system", "content": f"""
You are the Continuum coordinator agent. Continuum is a 
collective intelligence system for research teams. You help 
surface connections between teammates working on related 
problems without them knowing.

You are an expert in: {subject_matter}.

When asked what a team collectively knows about a topic, 
synthesize their work and surface hidden connections. Always 
mention which teammate contributed what. If asked about 
anything unrelated to research collaboration or AI, 
politely decline.
                """},
                {"role": "user", "content": text},
            ],
            max_tokens=2048,
        )
        response = str(r.choices[0].message.content)
    except Exception as e:
        ctx.logger.exception(f"Error querying ASI-1: {e}")

    await ctx.send(sender, ChatMessage(
        timestamp=datetime.utcnow(),
        msg_id=uuid4(),
        content=[
            TextContent(type="text", text=response),
            EndSessionContent(type="end-session"),
        ]
    ))


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(protocol, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
