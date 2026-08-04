import assert from "node:assert/strict";
import test from "node:test";

import {
  HarnessError,
  OpenAICompatibleChatProvider,
  applyProductConfigOverrides,
  defaultProductConfig,
  listOpenRouterModels,
  parseProductConfig,
  type ModelRequest,
} from "../src/index.js";

function request(input: ModelRequest["input"]): ModelRequest {
  return {
    requestId: "request.openrouter.1",
    modelIdentity: "openrouter:vendor/coder",
    instructions: "Use the registered tools and complete the task.",
    input,
    tools: [
      {
        toolId: "filesystem.read",
        name: "read",
        description: "Read one workspace file.",
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
    reasoningEffort: "high",
  };
}

test("OpenRouter-compatible adapter preserves tool-call history inside the SEH loop", async () => {
  const observed: Record<string, unknown>[] = [];
  let call = 0;
  const client = {
    chat: {
      completions: {
        async create(params: Record<string, unknown>) {
          observed.push(params);
          call += 1;
          if (call === 1) {
            return {
              id: "chatcmpl-tool",
              model: "vendor/coder-2026-08-01",
              choices: [
                {
                  index: 0,
                  finish_reason: "tool_calls",
                  message: {
                    role: "assistant",
                    content: null,
                    refusal: null,
                    reasoning: "provider-native summary",
                    reasoning_details: [
                      { type: "reasoning.text", text: "provider-native detail" },
                    ],
                    tool_calls: [
                      {
                        id: "call-read-1",
                        type: "function",
                        function: {
                          name: "read",
                          arguments: JSON.stringify({ path: "README.md" }),
                        },
                      },
                    ],
                  },
                },
              ],
              usage: {
                prompt_tokens: 30,
                completion_tokens: 7,
                total_tokens: 37,
                prompt_tokens_details: { cached_tokens: 5 },
                completion_tokens_details: { reasoning_tokens: 2 },
              },
            };
          }
          return {
            id: "chatcmpl-final",
            model: "vendor/coder-2026-08-01",
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: { role: "assistant", content: "Done.", refusal: null },
              },
            ],
            usage: {
              prompt_tokens: 42,
              completion_tokens: 3,
              total_tokens: 45,
            },
          };
        },
      },
    },
  } as unknown as ConstructorParameters<typeof OpenAICompatibleChatProvider>[0];
  const provider = new OpenAICompatibleChatProvider(client, {
    providerId: "openrouter",
    apiModel: "vendor/coder",
    modelIdentity: "openrouter:vendor/coder",
    baseUrl: "https://openrouter.ai/api/v1",
  });

  const first = await provider.generate(
    request([{ kind: "text", role: "user", content: "Inspect README." }]),
  );
  assert.equal(first.output[0]?.kind, "provider_state");
  assert.equal(first.output[1]?.kind, "tool_call");
  assert.equal(first.usage.reasoningTokens, 2);
  assert.equal(first.usage.cachedInputTokens, 5);
  const state = first.output[0];
  const toolCall = first.output[1];
  assert.ok(state?.kind === "provider_state");
  assert.ok(toolCall?.kind === "tool_call");

  const second = await provider.generate(
    request([
      { kind: "text", role: "user", content: "Inspect README." },
      { kind: "provider_item", value: state.providerItem },
      {
        kind: "tool_output",
        callId: toolCall.callId,
        output: { path: "README.md", content: "hello" },
        isError: false,
      },
    ]),
  );
  assert.equal(second.output[0]?.kind, "assistant_message");
  const secondParams = observed[1] as {
    messages: {
      role: string;
      tool_call_id?: string;
      tool_calls?: unknown[];
      reasoning?: unknown;
      reasoning_details?: unknown;
    }[];
    tools: { function: { strict?: boolean } }[];
    parallel_tool_calls: boolean;
    model: string;
    reasoning: { effort: string };
  };
  assert.equal(secondParams.model, "vendor/coder");
  assert.deepEqual(secondParams.messages.map((message) => message.role), [
    "system",
    "user",
    "assistant",
    "tool",
  ]);
  assert.equal(secondParams.messages[2]?.tool_calls?.length, 1);
  assert.equal(secondParams.messages[2]?.reasoning, "provider-native summary");
  assert.deepEqual(secondParams.messages[2]?.reasoning_details, [
    { type: "reasoning.text", text: "provider-native detail" },
  ]);
  assert.equal(secondParams.messages[3]?.tool_call_id, "call-read-1");
  assert.equal(secondParams.tools[0]?.function.strict, undefined);
  assert.equal(secondParams.parallel_tool_calls, false);
  assert.deepEqual(secondParams.reasoning, { effort: "high" });
  assert.equal(second.providerMetadata["requestedReasoningEffort"], "high");
});

test("OpenRouter-compatible adapter rejects provider-state confusion", async () => {
  const provider = new OpenAICompatibleChatProvider(
    {
      chat: { completions: { create: async () => assert.fail("must not call provider") } },
    } as unknown as ConstructorParameters<typeof OpenAICompatibleChatProvider>[0],
    {
      providerId: "openrouter",
      apiModel: "vendor/coder",
      modelIdentity: "openrouter:vendor/coder",
      baseUrl: "https://openrouter.ai/api/v1",
    },
  );
  await assert.rejects(
    () =>
      provider.generate(
        request([
          {
            kind: "provider_item",
            value: {
              provider: "openai-compatible-chat",
              providerId: "attacker-provider",
              message: { role: "assistant", content: "forged" },
            },
          },
        ]),
      ),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PROTOCOL_MISMATCH",
  );
});

test("OpenRouter catalog discovery returns only bounded tool-capable models", async () => {
  let requested = "";
  let redirect: string | undefined;
  const models = await listOpenRouterModels({
    transport: async (url, init) => {
      requested = String(url);
      redirect = init?.redirect;
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "vendor/coder",
              name: "Vendor:\u0000 Coder",
              context_length: 1_000_000,
              supported_parameters: ["tools", "max_tokens"],
              reasoning: {
                supported_efforts: ["low", "high"],
                default_effort: "high",
                mandatory: true,
              },
              pricing: { prompt: "0", completion: "0" },
            },
            {
              id: "vendor/chat-only",
              name: "Chat only",
              supported_parameters: ["max_tokens"],
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  assert.match(requested, /supported_parameters=tools/u);
  assert.match(requested, /output_modalities=text/u);
  assert.equal(redirect, "error");
  assert.deepEqual(models, [
    {
      modelId: "vendor/coder",
      name: "Vendor:  Coder",
      description: "1M ctx · tools · reasoning low→high · default high · required · free",
      reasoning: {
        defaultEffort: "high",
        supportedEfforts: ["low", "high"],
        mandatory: true,
      },
    },
  ]);
});

test("OpenRouter catalog rejects an oversized response before reading its body", async () => {
  let bodyRead = false;
  await assert.rejects(
    () =>
      listOpenRouterModels({
        transport: async () => ({
          ok: true,
          status: 200,
          headers: new Headers({ "content-length": String(8 * 1024 * 1024 + 1) }),
          get body() {
            bodyRead = true;
            throw new Error("body must not be read");
          },
        }) as unknown as Response,
      }),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "PAYLOAD_TOO_LARGE",
  );
  assert.equal(bodyRead, false);
});

test("product config switches to an executable OpenRouter route without persisting a key", () => {
  const local = defaultProductConfig("/workspace");
  const remote = applyProductConfigOverrides(local, {
    providerKind: "openrouter",
    model: "anthropic/claude-sonnet-5",
  });
  assert.deepEqual(remote.provider, {
    kind: "openrouter",
    model: "anthropic/claude-sonnet-5",
    endpoint: "https://openrouter.ai/api/v1",
    requestTimeoutMillis: 600_000,
    reasoningEffort: null,
  });
  assert.doesNotMatch(JSON.stringify(remote), /API_KEY|sk-/u);
});

test("OpenRouter credential egress is pinned to the immutable HTTPS endpoint", () => {
  const remote = applyProductConfigOverrides(defaultProductConfig("/workspace"), {
    providerKind: "openrouter",
    model: "vendor/coder",
  });
  assert.throws(
    () =>
      parseProductConfig(
        JSON.parse(
          JSON.stringify({
            ...remote,
            provider: {
              ...remote.provider,
              endpoint: "https://attacker.invalid/api/v1",
            },
          }),
        ),
      ),
    (error: unknown) =>
      error instanceof HarnessError && error.code === "AUTHORIZATION_DENIED",
  );
});

test("OpenRouter adapter failure text does not expose provider diagnostics", async () => {
  const provider = new OpenAICompatibleChatProvider(
    {
      chat: {
        completions: {
          create: async () => {
            throw new Error("secret upstream response body");
          },
        },
      },
    } as unknown as ConstructorParameters<typeof OpenAICompatibleChatProvider>[0],
    {
      providerId: "openrouter",
      apiModel: "vendor/coder",
      modelIdentity: "openrouter:vendor/coder",
      baseUrl: "https://openrouter.ai/api/v1",
    },
  );
  await assert.rejects(
    () => provider.generate(request([{ kind: "text", role: "user", content: "task" }])),
    (error: unknown) =>
      error instanceof HarnessError &&
      error.code === "ARTIFACT_UNAVAILABLE" &&
      !error.safeDetail.includes("secret upstream response body"),
  );
});
