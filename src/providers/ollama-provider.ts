import {
  canonicalize,
  parseStrictJson,
  sha256,
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

type FetchTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface OllamaToolCall {
  readonly function: {
    readonly name: string;
    readonly arguments: JsonValue;
  };
}

interface OllamaMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly tool_name?: string;
  readonly tool_calls?: readonly OllamaToolCall[];
}

interface OllamaChatResponse {
  readonly model: string;
  readonly created_at: string;
  readonly message: OllamaMessage;
  readonly done: boolean;
  readonly done_reason: string | null;
  readonly prompt_eval_count: number;
  readonly eval_count: number;
}

interface DecodedToolCalls {
  readonly calls: readonly OllamaToolCall[];
  readonly encoding: "native" | "content_json_fallback" | "none";
}

export interface OllamaProviderOptions {
  readonly model: string;
  readonly modelIdentity?: string;
  readonly baseUrl?: string;
  readonly requestTimeoutMillis?: number;
  readonly keepAlive?: string;
}

function objectValue(value: JsonValue, detail: string): Record<string, JsonValue> {
  assertCondition(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "SCHEMA_INVALID",
    detail,
  );
  return value;
}

function integerOrZero(value: JsonValue | undefined, name: string): number {
  if (value === undefined) return 0;
  assertCondition(
    Number.isSafeInteger(value) && (value as number) >= 0,
    "SCHEMA_INVALID",
    `Ollama ${name} is invalid`,
  );
  return value as number;
}

function normalizedBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new HarnessError("SCHEMA_INVALID", "Ollama endpoint is not a valid URL", {
      cause: error,
    });
  }
  assertCondition(
    (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.search.length === 0 &&
      url.hash.length === 0,
    "AUTHORIZATION_DENIED",
    "Ollama endpoint must be an uncredentialed HTTP(S) origin",
  );
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return url;
}

function endpoint(baseUrl: URL, pathname: string): URL {
  const prefix = baseUrl.pathname === "/" ? "" : baseUrl.pathname;
  const result = new URL(baseUrl.toString());
  result.pathname = `${prefix}${pathname}`;
  return result;
}

function asJsonValue(value: unknown, detail: string): JsonValue {
  const serialized = JSON.stringify(value);
  assertCondition(serialized !== undefined, "SCHEMA_INVALID", detail);
  return parseStrictJson(serialized);
}

function parseToolCalls(value: JsonValue | undefined): readonly OllamaToolCall[] {
  if (value === undefined) return [];
  assertCondition(Array.isArray(value), "SCHEMA_INVALID", "Ollama tool_calls must be an array");
  return value.map((candidate, index) => {
    const call = objectValue(candidate, `Ollama tool call ${index} is not an object`);
    const functionValue = objectValue(
      call["function"] ?? null,
      `Ollama tool call ${index} has no function`,
    );
    const name = functionValue["name"];
    assertCondition(
      typeof name === "string" && name.length > 0,
      "SCHEMA_INVALID",
      `Ollama tool call ${index} has no name`,
    );
    const rawArguments = functionValue["arguments"] ?? {};
    const argumentsValue =
      typeof rawArguments === "string" ? parseStrictJson(rawArguments) : rawArguments;
    const argumentsObject = objectValue(
      argumentsValue,
      `Ollama tool call ${index} arguments are not an object`,
    );
    return {
      function: {
        name,
        arguments: argumentsObject,
      },
    };
  });
}

function parseMessage(value: JsonValue): OllamaMessage {
  const message = objectValue(value, "Ollama response message is not an object");
  assertCondition(
    message["role"] === "assistant" && typeof message["content"] === "string",
    "SCHEMA_INVALID",
    "Ollama response message is malformed",
  );
  const toolCalls = parseToolCalls(message["tool_calls"]);
  return {
    role: "assistant",
    content: message["content"],
    ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
  };
}

function fallbackToolCalls(
  content: string,
  tools: ModelRequest["tools"],
): readonly OllamaToolCall[] {
  const trimmed = content.trim();
  if (trimmed.length === 0 || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return [];
  }
  let value: JsonValue;
  try {
    value = parseStrictJson(trimmed);
  } catch {
    return [];
  }
  const candidates = Array.isArray(value) ? value : [value];
  if (candidates.length === 0 || candidates.length > 16) return [];
  const calls: OllamaToolCall[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || keys[0] !== "arguments" || keys[1] !== "name") return [];
    const requestedName = candidate["name"];
    if (typeof requestedName !== "string" || requestedName.length === 0) return [];
    const binding = tools.find(
      (tool) => tool.name === requestedName || tool.toolId === requestedName,
    );
    if (binding === undefined) return [];
    const argumentsValue = candidate["arguments"];
    if (
      typeof argumentsValue !== "object" ||
      argumentsValue === null ||
      Array.isArray(argumentsValue)
    ) {
      return [];
    }
    calls.push({
      function: {
        name: binding.name,
        arguments: argumentsValue,
      },
    });
  }
  return calls;
}

function decodedToolCalls(
  message: OllamaMessage,
  tools: ModelRequest["tools"],
): DecodedToolCalls {
  const nativeCalls = message.tool_calls ?? [];
  if (nativeCalls.length > 0) return { calls: nativeCalls, encoding: "native" };
  const fallback = fallbackToolCalls(message.content, tools);
  return fallback.length === 0
    ? { calls: [], encoding: "none" }
    : { calls: fallback, encoding: "content_json_fallback" };
}

function parseChatResponse(value: JsonValue): OllamaChatResponse {
  const response = objectValue(value, "Ollama response is not an object");
  assertCondition(
    typeof response["model"] === "string" &&
      typeof response["created_at"] === "string" &&
      response["done"] === true,
    "SCHEMA_INVALID",
    "Ollama response omitted terminal metadata",
  );
  const doneReason = response["done_reason"];
  assertCondition(
    doneReason === undefined || doneReason === null || typeof doneReason === "string",
    "SCHEMA_INVALID",
    "Ollama done_reason is invalid",
  );
  return {
    model: response["model"],
    created_at: response["created_at"],
    message: parseMessage(response["message"] ?? null),
    done: true,
    done_reason: typeof doneReason === "string" ? doneReason : null,
    prompt_eval_count: integerOrZero(response["prompt_eval_count"], "prompt_eval_count"),
    eval_count: integerOrZero(response["eval_count"], "eval_count"),
  };
}

function providerMessage(value: JsonValue): OllamaMessage {
  const item = objectValue(value, "Ollama provider state is not an object");
  assertCondition(
    item["provider"] === "ollama",
    "PROTOCOL_MISMATCH",
    "Foreign provider state cannot be sent to Ollama",
  );
  return parseMessage(item["message"] ?? null);
}

function toMessages(
  request: ModelRequest,
  toolNamesByCallId: ReadonlyMap<string, string>,
): OllamaMessage[] {
  const messages: OllamaMessage[] = [];
  if (request.instructions.trim().length > 0) {
    messages.push({ role: "system", content: request.instructions });
  }
  for (const item of request.input) {
    if (item.kind === "text") {
      messages.push({ role: item.role, content: item.content });
    } else if (item.kind === "tool_output") {
      const toolName = toolNamesByCallId.get(item.callId);
      assertCondition(
        toolName !== undefined,
        "PROTOCOL_MISMATCH",
        `Ollama tool output ${item.callId} has no matching tool call`,
      );
      messages.push({
        role: "tool",
        tool_name: toolName,
        content: canonicalize(item.output),
      });
    } else {
      messages.push(providerMessage(item.value));
    }
  }
  return messages;
}

async function responseJson(response: Response, providerName: string): Promise<JsonValue> {
  const text = await response.text();
  assertCondition(
    Buffer.byteLength(text, "utf8") <= 16 * 1024 * 1024,
    "PAYLOAD_TOO_LARGE",
    `${providerName} response exceeds 16 MiB`,
  );
  if (!response.ok) {
    throw new HarnessError(
      response.status === 401 ? "AUTHENTICATION_FAILED" : "ARTIFACT_UNAVAILABLE",
      `${providerName} returned HTTP ${response.status}`,
      { retryable: response.status >= 500 },
    );
  }
  try {
    return parseStrictJson(text);
  } catch (error) {
    throw new HarnessError("SCHEMA_INVALID", `${providerName} returned invalid JSON`, {
      cause: error,
    });
  }
}

function requestSignal(
  caller: AbortSignal | undefined,
  timeoutMillis: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMillis);
  return caller === undefined ? timeout : AbortSignal.any([caller, timeout]);
}

export class OllamaProvider implements ModelProvider {
  public readonly providerId = "ollama";
  readonly #model: string;
  readonly #modelIdentity: string;
  readonly #baseUrl: URL;
  readonly #requestTimeoutMillis: number;
  readonly #keepAlive: string;
  readonly #fetch: FetchTransport;
  readonly #toolNamesByCallId = new Map<string, string>();

  public constructor(
    options: OllamaProviderOptions,
    transport: FetchTransport = globalThis.fetch,
  ) {
    assertCondition(options.model.trim().length > 0, "SCHEMA_INVALID", "Ollama model is empty");
    this.#model = options.model;
    this.#modelIdentity = options.modelIdentity ?? `ollama:${options.model}`;
    this.#baseUrl = normalizedBaseUrl(options.baseUrl ?? "http://127.0.0.1:11434");
    this.#requestTimeoutMillis = options.requestTimeoutMillis ?? 10 * 60_000;
    this.#keepAlive = options.keepAlive ?? "5m";
    this.#fetch = transport;
  }

  public get modelIdentity(): string {
    return this.#modelIdentity;
  }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    assertCondition(
      request.modelIdentity === this.#modelIdentity,
      "PROTOCOL_MISMATCH",
      "Requested model identity differs from the pinned Ollama identity",
    );
    const body = {
      model: this.#model,
      messages: toMessages(request, this.#toolNamesByCallId),
      tools: request.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      stream: false,
      keep_alive: this.#keepAlive,
      options: {
        temperature: 0,
        num_predict: request.maxOutputTokens,
      },
    };
    let httpResponse: Response;
    try {
      httpResponse = await this.#fetch(endpoint(this.#baseUrl, "/api/chat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: requestSignal(request.abortSignal, this.#requestTimeoutMillis),
      });
    } catch (error) {
      if (request.abortSignal?.aborted === true) {
        throw new HarnessError("DEADLINE_EXCEEDED", "Ollama request was cancelled", {
          cause: error,
        });
      }
      throw new HarnessError(
        "ARTIFACT_UNAVAILABLE",
        "Cannot reach Ollama. Start `ollama serve` and verify the configured endpoint.",
        { retryable: true, cause: error },
      );
    }
    const response = parseChatResponse(await responseJson(httpResponse, "Ollama"));
    const decoded = decodedToolCalls(response.message, request.tools);
    const historyMessage: OllamaMessage =
      decoded.calls.length === 0
        ? response.message
        : {
            role: "assistant",
            content: decoded.encoding === "native" ? response.message.content : "",
            tool_calls: decoded.calls,
          };
    const providerItem: JsonValue = {
      provider: "ollama",
      message: asJsonValue(historyMessage, "Ollama message is not JSON"),
    };
    const output: ModelOutputItem[] = [];
    const calls = decoded.calls;
    if (calls.length > 0) {
      output.push({ kind: "provider_state", providerItem });
      for (const [index, call] of calls.entries()) {
        const callId = `${request.requestId}.tool.${index}`;
        this.#toolNamesByCallId.set(callId, call.function.name);
        output.push({
          kind: "tool_call",
          callId,
          toolName: call.function.name,
          arguments: call.function.arguments,
          rawArguments: canonicalize(call.function.arguments),
        });
      }
    } else {
      output.push({ kind: "assistant_message", text: response.message.content });
    }
    const totalTokens = response.prompt_eval_count + response.eval_count;
    return {
      responseId: `ollama-${sha256({
        requestId: request.requestId,
        createdAt: response.created_at,
        model: response.model,
        output,
      }).slice("sha256:".length, "sha256:".length + 32)}`,
      modelIdentity: this.#modelIdentity,
      output,
      usage: {
        inputTokens: response.prompt_eval_count,
        outputTokens: response.eval_count,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens,
      },
      providerMetadata: {
        provider: "ollama",
        requestedModel: this.#model,
        reportedModel: response.model,
        doneReason: response.done_reason,
        toolCallEncoding: decoded.encoding,
        localEndpoint: this.#baseUrl.origin,
      },
    };
  }
}

export async function listOllamaModels(
  baseUrl = "http://127.0.0.1:11434",
  options: {
    readonly timeoutMillis?: number;
    readonly transport?: FetchTransport;
  } = {},
): Promise<readonly string[]> {
  const origin = normalizedBaseUrl(baseUrl);
  const transport = options.transport ?? globalThis.fetch;
  let response: Response;
  try {
    response = await transport(endpoint(origin, "/api/tags"), {
      method: "GET",
      signal: AbortSignal.timeout(options.timeoutMillis ?? 2_000),
    });
  } catch (error) {
    throw new HarnessError(
      "ARTIFACT_UNAVAILABLE",
      "Cannot reach Ollama. Start `ollama serve` and retry.",
      { retryable: true, cause: error },
    );
  }
  const value = objectValue(await responseJson(response, "Ollama"), "Ollama tags are invalid");
  const models = value["models"];
  assertCondition(Array.isArray(models), "SCHEMA_INVALID", "Ollama tags omit models");
  return models
    .map((candidate) => objectValue(candidate, "Ollama model entry is invalid")["name"])
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .sort();
}
