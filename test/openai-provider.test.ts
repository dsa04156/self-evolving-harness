import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAIResponsesProvider,
  type ModelRequest,
} from "../src/index.js";

test("OpenAI Responses adapter pins request controls and records the provider-reported model", async () => {
  let observed: Record<string, unknown> | null = null;
  const client = {
    responses: {
      async create(params: Record<string, unknown>) {
        observed = params;
        return {
          id: "resp_synthetic_adapter_1",
          model: "gpt-5.6-luna-2026-07-31",
          output: [
            {
              type: "message",
              id: "msg_synthetic_adapter_1",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "SYNTHETIC_PROVIDER_OK",
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 10,
            input_tokens_details: {
              cached_tokens: 0,
              cache_write_tokens: 0,
            },
            output_tokens: 5,
            output_tokens_details: {
              reasoning_tokens: 0,
            },
            total_tokens: 15,
          },
          status: "completed",
          service_tier: "default",
        };
      },
    },
  } as unknown as ConstructorParameters<
    typeof OpenAIResponsesProvider
  >[0];
  const provider = new OpenAIResponsesProvider(client, {
    apiModel: "gpt-5.6-luna",
    modelIdentity:
      "openai:gpt-5.6-luna@alias-observed-2026-07-31",
    serviceTier: "default",
  });
  const request: ModelRequest = {
    requestId: "provider-request.adapter.synthetic.1",
    modelIdentity:
      "openai:gpt-5.6-luna@alias-observed-2026-07-31",
    instructions:
      "Synthetic adapter test; no provider call is made.",
    input: [
      {
        kind: "text",
        role: "user",
        content: "Return the fixed token.",
      },
    ],
    tools: [],
    maxOutputTokens: 32,
    reasoningEffort: "none",
  };

  const response = await provider.generate(request);

  assert.deepEqual(
    observed,
    {
      model: "gpt-5.6-luna",
      instructions: request.instructions,
      input: [
        {
          role: "user",
          content: "Return the fixed token.",
        },
      ],
      tools: [],
      max_output_tokens: 32,
      parallel_tool_calls: false,
      store: false,
      include: ["reasoning.encrypted_content"],
      reasoning: {
        effort: "none",
        context: "all_turns",
      },
      service_tier: "default",
    },
  );
  assert.equal(
    response.providerMetadata["requestedApiModel"],
    "gpt-5.6-luna",
  );
  assert.equal(
    response.providerMetadata["reportedModel"],
    "gpt-5.6-luna-2026-07-31",
  );
  assert.equal(response.providerMetadata["requestedReasoningEffort"], "none");
  assert.equal(response.usage.totalTokens, 15);
});
