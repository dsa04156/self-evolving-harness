import type { JsonValue } from "../core/canonical.js";

export type ConversationRole = "system" | "user" | "assistant";

export interface TextInputItem {
  readonly kind: "text";
  readonly role: ConversationRole;
  readonly content: string;
}

export interface PriorModelItem {
  readonly kind: "provider_item";
  readonly value: JsonValue;
}

export interface ToolOutputInputItem {
  readonly kind: "tool_output";
  readonly callId: string;
  readonly output: JsonValue;
  readonly isError: boolean;
}

export type ModelInputItem = TextInputItem | PriorModelItem | ToolOutputInputItem;

export interface ModelTool {
  readonly toolId: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, JsonValue>;
  readonly strict: true;
}

export interface ModelRequest {
  readonly requestId: string;
  readonly modelIdentity: string;
  readonly instructions: string;
  readonly input: readonly ModelInputItem[];
  readonly tools: readonly ModelTool[];
  readonly maxOutputTokens: number;
  readonly reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  readonly abortSignal?: AbortSignal;
}

export interface AssistantMessageOutput {
  readonly kind: "assistant_message";
  readonly text: string;
  readonly providerItem?: JsonValue;
}

export interface ToolCallOutput {
  readonly kind: "tool_call";
  readonly callId: string;
  readonly toolName: string;
  readonly arguments: JsonValue;
  readonly rawArguments: string;
  readonly providerItem?: JsonValue;
}

export interface ProviderStateOutput {
  readonly kind: "provider_state";
  readonly providerItem: JsonValue;
}

export type ModelOutputItem = AssistantMessageOutput | ToolCallOutput | ProviderStateOutput;

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteTokens?: number;
  readonly totalTokens: number;
}

export interface ModelResponse {
  readonly responseId: string;
  readonly modelIdentity: string;
  readonly output: readonly ModelOutputItem[];
  readonly usage: ModelUsage;
  readonly providerMetadata: Readonly<Record<string, JsonValue>>;
}

export interface ModelProvider {
  readonly providerId: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}
