const { test } = require("node:test");
const assert = require("node:assert");
const letta = require("./letta");

test("extractAssistantText: picks the assistant message string", () => {
  const data = {
    messages: [
      { message_type: "reasoning_message", reasoning: "thinking…" },
      { message_type: "assistant_message", content: "Here is your answer." },
    ],
  };
  assert.equal(letta.extractAssistantText(data), "Here is your answer.");
});

test("extractAssistantText: joins array content parts", () => {
  const data = {
    messages: [
      { message_type: "assistant_message", content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ] },
    ],
  };
  assert.equal(letta.extractAssistantText(data), "Hello world");
});

test("extractAssistantText: falls back to role=assistant + text field", () => {
  assert.equal(
    letta.extractAssistantText({ messages: [{ role: "assistant", text: "Yo" }] }),
    "Yo",
  );
});

test("extractAssistantText: returns null when no assistant message", () => {
  assert.equal(letta.extractAssistantText({ messages: [{ message_type: "reasoning_message" }] }), null);
  assert.equal(letta.extractAssistantText({}), null);
  assert.equal(letta.extractAssistantText(null), null);
});
