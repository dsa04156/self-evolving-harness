import OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInput,
  ResponseInputItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses.js";

import {
  canonicalize,
  parseStrictJson,
  type JsonValue,
} from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type {
  ModelInputItem,
  ModelOutputItem,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../domain/model.js";

type ResponsesClient = Pick<OpenAI, "responses">;

function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  assertCondition(serialized !== undefined, "SCHEMA_INVALID", "Provider item is not JSON");
  return parseStrictJson(serialized);
}

function toResponseInput(items: readonly ModelInputItem[]): ResponseInput {
  return items.map((item): ResponseInputItem => {
    if (item.kind === "text") {
      return {
        role: item.role,
        content: item.content,
      };
    }
    if (item.kind === "tool_output") {
      return {
        type: "function_call_output",
        call_id: item.callId,
        output: canonicalize(item.output),
        status: item.isError ? "incomplete" : "completed",
      };
    }
    return item.value as unknown as ResponseInputItem;
  });
}

function toFunctionTools(request: ModelRequest): FunctionTool[] {
  return request.tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: tool.strict,
  }));
}

function outputMessage(item: Extract<ResponseOutputItem, { type: "message" }>): string {
  return item.content
    .map((content) => (content.type === "output_text" ? content.text : content.refusal))
    .join("\n");
}

function toModelOutput(item: ResponseOutputItem): ModelOutputItem {
  const providerItem = toJsonValue(item);
  if (item.type === "message") {
    return {
      kind: "assistant_message",
      text: outputMessage(item),
      providerItem,
    };
  }
  if (item.type === "function_call") {
    let argumentsValue: JsonValue;
    try {
      argumentsValue = parseStrictJson(item.arguments);
    } catch (error) {
      throw new HarnessError("SCHEMA_INVALID", "Provider emitted invalid function arguments", {
        cause: error,
      });
    }
    return {
      kind: "tool_call",
      callId: item.call_id,
      toolName: item.name,
      arguments: argumentsValue,
      rawArguments: item.arguments,
      providerItem,
    };
  }
  return { kind: "provider_state", providerItem };
}

export interface OpenAIResponsesProviderOptions {
  readonly apiModel: string;
  readonly modelIdentity: string;
  readonly serviceTier?: "auto" | "default" | "flex" | "scale" | "priority";
  readonly safetyIdentifier?: string;
}

export class OpenAIResponsesProvider implements ModelProvider {
  public readonly providerId = "openai-responses";
  readonly #client: ResponsesClient;
  readonly #options: OpenAIResponsesProviderOptions;

  public constructor(client: ResponsesClient, options: OpenAIResponsesProviderOptions) {
    this.#client = client;
    this.#options = options;
  }

  public static fromApiKey(
    apiKey: string,
    options: OpenAIResponsesProviderOptions,
  ): OpenAIResponsesProvider {
    assertCondition(apiKey.length > 0, "AUTHENTICATION_FAILED", "OpenAI API key is empty");
    return new OpenAIResponsesProvider(new OpenAI({ apiKey }), options);
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    assertCondition(
      request.modelIdentity === this.#options.modelIdentity,
      "PROTOCOL_MISMATCH",
      "Requested model identity differs from the pinned provider identity",
    );
    const params: ResponseCreateParamsNonStreaming = {
      model: this.#options.apiModel,
      instructions: request.instructions,
      input: toResponseInput(request.input),
      tools: toFunctionTools(request),
      max_output_tokens: request.maxOutputTokens,
      parallel_tool_calls: false,
      store: false,
      include: ["reasoning.encrypted_content"],
      ...(request.reasoningEffort === undefined
        ? {}
        : {
            reasoning: {
              effort: request.reasoningEffort,
              context: "all_turns",
            },
          }),
      ...(this.#options.serviceTier === undefined
        ? {}
        : { service_tier: this.#options.serviceTier }),
      ...(this.#options.safetyIdentifier === undefined
        ? {}
        : { safety_identifier: this.#options.safetyIdentifier }),
    };
    const response: Response = await this.#client.responses.create(params, {
      signal: request.abortSignal,
    });
    assertCondition(
      response.usage !== null && response.usage !== undefined,
      "SCHEMA_INVALID",
      "Provider omitted token usage",
    );
    const usage = response.usage;
    return {
      responseId: response.id,
      modelIdentity: this.#options.modelIdentity,
      output: response.output.map(toModelOutput),
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        reasoningTokens: usage.output_tokens_details.reasoning_tokens,
        cachedInputTokens: usage.input_tokens_details.cached_tokens,
        totalTokens: usage.total_tokens,
      },
      providerMetadata: {
        provider: "openai",
        apiModel: this.#options.apiModel,
        status: response.status ?? null,
        serviceTier: response.service_tier ?? null,
        store: false,
      },
    };
  }
}
