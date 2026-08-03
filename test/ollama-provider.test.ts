import assert from "node:assert/strict";
import test from "node:test";

import {
  HarnessError,
  OllamaProvider,
  listOllamaModels,
  type ModelRequest,
} from "../src/index.js";

function request(input: ModelRequest["input"]): ModelRequest {
  return {
    requestId: "request.ollama.1",
    modelIdentity: "ollama:test-coder",
    instructions: "Use tools and finish the task.",
    input,
    tools: [
      {
        toolId: "filesystem.read",
        name: "read",
        description: "Read a file.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["path"],
          properties: { path: { type: "string" } },
        },
        strict: true,
      },
    ],
    maxOutputTokens: 512,
  };
}

test("Ollama adapter preserves native tool-call history and usage", async () => {
  const observed: unknown[] = [];
  let call = 0;
  const provider = new OllamaProvider(
    {
      model: "test-coder",
      modelIdentity: "ollama:test-coder",
      baseUrl: "http://127.0.0.1:11434",
    },
    async (_url, init) => {
      observed.push(JSON.parse(String(init?.body)));
      call += 1;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            model: "test-coder:latest",
            created_at: "2026-08-03T00:00:00Z",
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                { function: { name: "read", arguments: { path: "README.md" } } },
              ],
            },
            done: true,
            done_reason: "stop",
            prompt_eval_count: 21,
            eval_count: 7,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          model: "test-coder:latest",
          created_at: "2026-08-03T00:00:01Z",
          message: { role: "assistant", content: "Done." },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 30,
          eval_count: 4,
        }),
        { status: 200 },
      );
    },
  );

  const first = await provider.generate(
    request([{ kind: "text", role: "user", content: "Inspect README." }]),
  );
  assert.equal(first.output[0]?.kind, "provider_state");
  assert.equal(first.output[1]?.kind, "tool_call");
  assert.equal(first.usage.totalTokens, 28);
  const providerState = first.output[0];
  assert.ok(providerState?.kind === "provider_state");
  const toolCall = first.output[1];
  assert.ok(toolCall?.kind === "tool_call");

  const second = await provider.generate(
    request([
      { kind: "text", role: "user", content: "Inspect README." },
      { kind: "provider_item", value: providerState.providerItem },
      {
        kind: "tool_output",
        callId: toolCall.callId,
        output: { path: "README.md", content: "hello" },
        isError: false,
      },
    ]),
  );
  assert.deepEqual(second.output, [{ kind: "assistant_message", text: "Done." }]);
  assert.equal(observed.length, 2);
  const secondBody = observed[1] as {
    messages: {
      role: string;
      content: string;
      tool_name?: string;
      tool_calls?: unknown[];
    }[];
    tools: unknown[];
    stream: boolean;
  };
  assert.deepEqual(
    secondBody.messages.map((message) => message.role),
    ["system", "user", "assistant", "tool"],
  );
  assert.equal(secondBody.messages[2]?.tool_calls?.length, 1);
  assert.equal(secondBody.messages[3]?.tool_name, "read");
  assert.equal(secondBody.tools.length, 1);
  assert.equal(secondBody.stream, false);
});

test("Ollama model discovery is strict and sorted", async () => {
  const models = await listOllamaModels("http://127.0.0.1:11434", {
    transport: async () =>
      new Response(
        JSON.stringify({
          models: [{ name: "qwen3-coder:30b" }, { name: "qwen2.5-coder:7b" }],
        }),
        { status: 200 },
      ),
  });
  assert.deepEqual(models, ["qwen2.5-coder:7b", "qwen3-coder:30b"]);
});

test("Ollama adapter promotes an exact known content-JSON call to a tool call", async () => {
  const provider = new OllamaProvider(
    { model: "test-coder", modelIdentity: "ollama:test-coder" },
    async () =>
      new Response(
        JSON.stringify({
          model: "test-coder",
          created_at: "2026-08-03T00:00:00Z",
          message: {
            role: "assistant",
            content: JSON.stringify({
              name: "filesystem.read",
              arguments: { path: "README.md" },
            }),
          },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 10,
          eval_count: 5,
        }),
        { status: 200 },
      ),
  );
  const result = await provider.generate(
    request([{ kind: "text", role: "user", content: "Read README." }]),
  );
  assert.equal(result.output[0]?.kind, "provider_state");
  const toolCall = result.output[1];
  assert.ok(toolCall?.kind === "tool_call");
  assert.equal(toolCall.toolName, "read");
  assert.deepEqual(toolCall.arguments, { path: "README.md" });
  assert.equal(result.providerMetadata["toolCallEncoding"], "content_json_fallback");
});

test("Ollama adapter does not execute unknown or decorated content JSON", async () => {
  for (const content of [
    JSON.stringify({ name: "host.delete", arguments: { path: "/" } }),
    JSON.stringify({ name: "read", arguments: { path: "README.md" }, extra: true }),
  ]) {
    const provider = new OllamaProvider(
      { model: "test-coder", modelIdentity: "ollama:test-coder" },
      async () =>
        new Response(
          JSON.stringify({
            model: "test-coder",
            created_at: "2026-08-03T00:00:00Z",
            message: { role: "assistant", content },
            done: true,
            done_reason: "stop",
            prompt_eval_count: 10,
            eval_count: 5,
          }),
          { status: 200 },
        ),
    );
    const result = await provider.generate(
      request([{ kind: "text", role: "user", content: "Return JSON." }]),
    );
    assert.deepEqual(result.output, [{ kind: "assistant_message", text: content }]);
    assert.equal(result.providerMetadata["toolCallEncoding"], "none");
  }
});

test("Ollama transport fails closed without leaking a response body", async () => {
  const provider = new OllamaProvider(
    { model: "test-coder", modelIdentity: "ollama:test-coder" },
    async () => new Response("secret provider diagnostic", { status: 500 }),
  );
  await assert.rejects(
    () => provider.generate(request([{ kind: "text", role: "user", content: "task" }])),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "ARTIFACT_UNAVAILABLE" &&
      !error.safeDetail.includes("secret provider diagnostic"),
  );
});
