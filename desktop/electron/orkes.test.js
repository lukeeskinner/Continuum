const test = require("node:test");
const assert = require("node:assert");
const { WORKFLOW_NAME, buildIngestWorkflowDef, buildIngestInput } = require("./orkes");

test("buildIngestWorkflowDef: defines the continuum_ingest HTTP workflow", () => {
  const def = buildIngestWorkflowDef();
  assert.strictEqual(def.name, WORKFLOW_NAME);
  assert.strictEqual(def.schemaVersion, 2);
  assert.ok(def.ownerEmail, "ownerEmail is required by Orkes");
  assert.strictEqual(def.tasks.length, 1);

  const task = def.tasks[0];
  assert.strictEqual(task.type, "HTTP");
  assert.match(task.inputParameters.http_request.uri, /agent-sync$/);
  assert.strictEqual(task.inputParameters.http_request.method, "POST");
  // The agent-sync secret is passed through the workflow input, not hard-coded.
  assert.strictEqual(
    task.inputParameters.http_request.headers["x-continuum-secret"],
    "${workflow.input.secret}",
  );
});

test("buildIngestInput: maps the descriptor into the workflow input", () => {
  const input = buildIngestInput({
    app: "Cursor",
    topic: "transformers",
    concept: "attention masking",
    error_type: "TypeError",
  });
  assert.deepStrictEqual(input.descriptor, {
    app: "Cursor",
    topic: "transformers",
    concept: "attention masking",
    error_type: "TypeError",
  });
  // Routing fields are present (values come from config; may be empty in tests).
  assert.ok("functionsUrl" in input);
  assert.ok("secret" in input);
  assert.ok("clusterId" in input);
});

test("buildIngestInput: defaults a missing error_type to null", () => {
  const input = buildIngestInput({ app: "VS Code", topic: "rust", concept: "lifetime" });
  assert.strictEqual(input.descriptor.error_type, null);
});
