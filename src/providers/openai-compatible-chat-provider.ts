import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions/completions.js";

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

type ChatClient = Pick<OpenAI, "chat">;

interface ChatHistoryEnvelope {
  readonly provider: "openai-compatible-chat";
  readonly providerId: string;
  readonly message: JsonValue;
}

function record(value: JsonValue, detail: string): Record<string, JsonValue> {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    detail,
  );
  return value;
}

function jsonValue(value: unknown, detail: string): JsonValue {
  const serialized = JSON.stringify(value);
  assertCondition(serialized !== undefined, "SCHEMA_INVALID", detail);
  return parseStrictJson(serialized);
}

function historyEnvelope(
  providerId: string,
  message: {
    readonly content: string | null;
    readonly tool_calls?: readonly unknown[];
    readonly reasoning?: unknown;
    readonly reasoning_details?: unknown;
  },
): ChatHistoryEnvelope {
  return {
    provider: "openai-compatible-chat",
    providerId,
    message: jsonValue(
      {
        role: "assistant",
        content: message.content,
        ...(message.tool_calls === undefined ? {} : { tool_calls: message.tool_calls }),
        ...(message.reasoning === undefined ? {} : { reasoning: message.reasoning }),
        ...(message.reasoning_details === undefined
          ? {}
          : { reasoning_details: message.reasoning_details }),
      },
      "Chat completion history is not JSON",
    ),
  };
}

function priorMessage(value: JsonValue, providerId: string): ChatCompletionMessageParam {
  const envelope = record(value, "Chat completion history envelope is invalid");
  assertCondition(
    envelope["provider"] === "openai-compatible-chat" &&
      envelope["providerId"] === providerId,
    "PROTOCOL_MISMATCH",
    "Chat completion history belongs to another provider",
  );
  const message = record(
    envelope["message"] ?? null,
    "Chat completion history message is invalid",
  );
  assertCondition(
    message["role"] === "assistant",
    "PROTOCOL_MISMATCH",
    "Chat completion history role is invalid",
  );
  return message as unknown as ChatCompletionMessageParam;
}

function toMessages(
  request: ModelRequest,
  providerId: string,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: request.instructions },
  ];
  for (const item of request.input) {
    if (item.kind === "text") {
      messages.push({ role: item.role, content: item.content });
      continue;
    }
    if (item.kind === "provider_item") {
      messages.push(priorMessage(item.value, providerId));
      continue;
    }
    messages.push({
      role: "tool",
      tool_call_id: item.callId,
      content: canonicalize(item.output),
    });
  }
  return messages;
}

function toTools(request: ModelRequest): ChatCompletionTool[] {
  return request.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export interface OpenAICompatibleChatProviderOptions {
  readonly providerId: string;
  readonly apiModel: string;
  readonly modelIdentity: string;
  readonly baseUrl: string;
  readonly requestTimeoutMillis?: number;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

/**
 * A narrow OpenAI Chat Completions transport. It adapts provider wire data into
 * SEH's own model contract; it does not outsource the agent loop or tool execution.
 */
export class OpenAICompatibleChatProvider implements ModelProvider {
  public readonly providerId: string;
  readonly #client: ChatClient;
  readonly #options: OpenAICompatibleChatProviderOptions;

  public constructor(client: ChatClient, options: OpenAICompatibleChatProviderOptions) {
    this.providerId = options.providerId;
    this.#client = client;
    this.#options = options;
  }

  public static fromApiKey(
    apiKey: string,
    options: OpenAICompatibleChatProviderOptions,
  ): OpenAICompatibleChatProvider {
    assertCondition(apiKey.length > 0, "AUTHENTICATION_FAILED", `${options.providerId} API key is empty`);
    const client = new OpenAI({
      apiKey,
      baseURL: options.baseUrl,
      timeout: options.requestTimeoutMillis ?? 10 * 60_000,
      maxRetries: 0,
      ...(options.defaultHeaders === undefined
        ? {}
        : { defaultHeaders: { ...options.defaultHeaders } }),
    });
    return new OpenAICompatibleChatProvider(client, options);
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    assertCondition(
      request.modelIdentity === this.#options.modelIdentity,
      "PROTOCOL_MISMATCH",
      "Requested model identity differs from the pinned provider identity",
    );
    const params: ChatCompletionCreateParamsNonStreaming & {
      readonly reasoning?: { readonly effort: NonNullable<ModelRequest["reasoningEffort"]> };
    } = {
      model: this.#options.apiModel,
      messages: toMessages(request, this.providerId),
      tools: toTools(request),
      max_tokens: request.maxOutputTokens,
      parallel_tool_calls: false,
      stream: false,
      ...(request.reasoningEffort === undefined
        ? {}
        : { reasoning: { effort: request.reasoningEffort } }),
    };
    let response: ChatCompletion;
    try {
      response = await this.#client.chat.completions.create(params, {
        signal: request.abortSignal,
      });
    } catch (error) {
      if (request.abortSignal?.aborted === true) {
        throw new HarnessError("DEADLINE_EXCEEDED", `${this.providerId} request was cancelled`, {
          cause: error,
        });
      }
      throw new HarnessError(
        "ARTIFACT_UNAVAILABLE",
        `${this.providerId} request failed; verify the model, credential, and provider status`,
        { retryable: true, cause: error },
      );
    }
    const choice = response.choices[0];
    assertCondition(choice !== undefined, "SCHEMA_INVALID", `${this.providerId} returned no choices`);
    assertCondition(response.usage !== undefined, "SCHEMA_INVALID", `${this.providerId} omitted token usage`);
    const message = choice.message;
    const providerMessage = message as unknown as Record<string, unknown>;
    const toolCalls = message.tool_calls ?? [];
    const output: ModelOutputItem[] = [];
    if (toolCalls.length > 0) {
      assertCondition(
        toolCalls.every((call) => call.type === "function"),
        "SCHEMA_INVALID",
        `${this.providerId} emitted an unsupported custom tool call`,
      );
      output.push({
        kind: "provider_state",
        providerItem: historyEnvelope(this.providerId, {
          content: message.content,
          tool_calls: toolCalls,
          ...(providerMessage["reasoning"] === undefined
            ? {}
            : { reasoning: providerMessage["reasoning"] }),
          ...(providerMessage["reasoning_details"] === undefined
            ? {}
            : { reasoning_details: providerMessage["reasoning_details"] }),
        }) as unknown as JsonValue,
      });
      for (const call of toolCalls) {
        assertCondition(call.type === "function", "SCHEMA_INVALID", "Unsupported tool call type");
        let argumentsValue: JsonValue;
        try {
          argumentsValue = parseStrictJson(call.function.arguments);
        } catch (error) {
          throw new HarnessError("SCHEMA_INVALID", "Provider emitted invalid function arguments", {
            cause: error,
          });
        }
        output.push({
          kind: "tool_call",
          callId: call.id,
          toolName: call.function.name,
          arguments: argumentsValue,
          rawArguments: call.function.arguments,
        });
      }
    } else {
      const text = message.content ?? message.refusal ?? "";
      assertCondition(text.length > 0, "SCHEMA_INVALID", `${this.providerId} returned an empty message`);
      output.push({
        kind: "assistant_message",
        text,
        providerItem: historyEnvelope(this.providerId, { content: text }) as unknown as JsonValue,
      });
    }
    const usage = response.usage;
    return {
      responseId: response.id,
      modelIdentity: this.#options.modelIdentity,
      output,
      usage: {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
        cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        totalTokens: usage.total_tokens,
      },
      providerMetadata: {
        provider: this.providerId,
        requestedApiModel: this.#options.apiModel,
        reportedModel: response.model,
        finishReason: choice.finish_reason,
        transport: "openai-chat-completions",
        requestedReasoningEffort: request.reasoningEffort ?? null,
      },
    };
  }
}
