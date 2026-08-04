export const PRODUCT_PROVIDER_KINDS = [
  "openai",
  "openrouter",
  "ollama",
] as const;

export type ProductProviderKind = (typeof PRODUCT_PROVIDER_KINDS)[number];

export interface ProductProviderCatalogEntry {
  readonly modelId: string;
  readonly name: string;
  readonly description: string;
}

export interface ProductProviderDescriptor {
  readonly kind: ProductProviderKind;
  readonly label: string;
  readonly transport: "responses" | "chat-completions" | "ollama-chat";
  readonly credentialEnvironmentVariable: string | null;
  readonly endpoint: string | null;
  readonly description: string;
  readonly examples: readonly ProductProviderCatalogEntry[];
}

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";

const OPENAI_MODELS: readonly ProductProviderCatalogEntry[] = [
  {
    modelId: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    description: "current flagship for complex coding and agentic work",
  },
  {
    modelId: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    description: "current balance of intelligence, cost, and throughput",
  },
  {
    modelId: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    description: "current efficient model for high-volume workloads",
  },
  {
    modelId: "gpt-5.6",
    name: "GPT-5.6",
    description: "OpenAI alias that currently routes to GPT-5.6 Sol",
  },
  {
    modelId: "gpt-5.5",
    name: "GPT-5.5",
    description: "previous frontier coding and professional-work model",
  },
  {
    modelId: "gpt-5.4",
    name: "GPT-5.4",
    description: "coding and professional work",
  },
  {
    modelId: "gpt-5.4-mini",
    name: "GPT-5.4 mini",
    description: "smaller coding, computer-use, and subagent model",
  },
  {
    modelId: "gpt-5.4-nano",
    name: "GPT-5.4 nano",
    description: "low-cost model for simple high-volume tasks",
  },
  {
    modelId: "gpt-5.3-codex",
    name: "GPT-5.3-Codex",
    description: "agentic coding model",
  },
  {
    modelId: "gpt-5.2-codex",
    name: "GPT-5.2-Codex",
    description: "long-horizon agentic coding model",
  },
  {
    modelId: "gpt-5.2",
    name: "GPT-5.2",
    description: "previous professional-work reasoning model",
  },
  {
    modelId: "gpt-5.1-codex-max",
    name: "GPT-5.1-Codex-Max",
    description: "long-running coding tasks",
  },
  {
    modelId: "gpt-5.1-codex",
    name: "GPT-5.1-Codex",
    description: "agentic coding model",
  },
  {
    modelId: "gpt-5.1-codex-mini",
    name: "GPT-5.1-Codex mini",
    description: "smaller, cost-efficient Codex model",
  },
  {
    modelId: "gpt-5.1",
    name: "GPT-5.1",
    description: "coding and agentic tasks",
  },
  {
    modelId: "gpt-5-codex",
    name: "GPT-5-Codex",
    description: "GPT-5 generation coding model",
  },
  {
    modelId: "gpt-5",
    name: "GPT-5",
    description: "reasoning model for coding and agentic tasks",
  },
  {
    modelId: "gpt-5-mini",
    name: "GPT-5 mini",
    description: "lower-latency general reasoning model",
  },
  {
    modelId: "gpt-5-nano",
    name: "GPT-5 nano",
    description: "fast, cost-efficient GPT-5 model",
  },
  {
    modelId: "codex-mini-latest",
    name: "Codex mini latest",
    description: "compact reasoning model optimized for coding agents",
  },
  {
    modelId: "o3",
    name: "o3",
    description: "previous full reasoning model",
  },
  {
    modelId: "o4-mini",
    name: "o4-mini",
    description: "fast previous-generation reasoning model",
  },
  {
    modelId: "gpt-4.1",
    name: "GPT-4.1",
    description: "non-reasoning model with strong instruction following",
  },
] as const;

const OPENROUTER_MODELS: readonly ProductProviderCatalogEntry[] = [
  {
    modelId: "openai/gpt-5.6-sol",
    name: "OpenAI GPT-5.6 Sol",
    description: "frontier OpenAI route; account access and pricing vary",
  },
  {
    modelId: "anthropic/claude-sonnet-5",
    name: "Anthropic Claude Sonnet 5",
    description: "Anthropic coding route through OpenRouter",
  },
  {
    modelId: "google/gemini-3.6-flash",
    name: "Google Gemini 3.6 Flash",
    description: "long-context Google route through OpenRouter",
  },
  {
    modelId: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    description: "DeepSeek reasoning route through OpenRouter",
  },
  {
    modelId: "qwen/qwen3.8-max",
    name: "Qwen3.8 Max",
    description: "Qwen tool-capable route through OpenRouter",
  },
] as const;

const OLLAMA_MODELS: readonly ProductProviderCatalogEntry[] = [
  {
    modelId: "qwen3-coder:30b",
    name: "Qwen3-Coder 30B",
    description: "agentic coding · 19 GB download · 256K context",
  },
  {
    modelId: "qwen3-coder-next",
    name: "Qwen3-Coder-Next",
    description: "agentic coding and tool calling · 52 GB download",
  },
  {
    modelId: "gpt-oss:20b",
    name: "gpt-oss 20B",
    description: "reasoning and function calling · 14 GB download",
  },
  {
    modelId: "gpt-oss:120b",
    name: "gpt-oss 120B",
    description: "larger reasoning model · 65 GB download",
  },
  {
    modelId: "qwen3:30b",
    name: "Qwen3 30B",
    description: "tool-capable general model · 19 GB download",
  },
  {
    modelId: "qwen3:8b",
    name: "Qwen3 8B",
    description: "smaller tool-capable model · 5.2 GB download",
  },
  {
    modelId: "qwen2.5-coder:7b",
    name: "Qwen2.5-Coder 7B",
    description: "lightweight coding baseline",
  },
  {
    modelId: "qwen2.5-coder:14b",
    name: "Qwen2.5-Coder 14B",
    description: "mid-size coding baseline",
  },
  {
    modelId: "qwen2.5-coder:32b",
    name: "Qwen2.5-Coder 32B",
    description: "larger coding baseline",
  },
] as const;

export const PRODUCT_PROVIDER_REGISTRY: readonly ProductProviderDescriptor[] = [
  {
    kind: "openai",
    label: "OpenAI",
    transport: "responses",
    credentialEnvironmentVariable: "OPENAI_API_KEY",
    endpoint: "https://api.openai.com/v1",
    description: "direct OpenAI Responses API",
    examples: OPENAI_MODELS,
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    transport: "chat-completions",
    credentialEnvironmentVariable: "OPENROUTER_API_KEY",
    endpoint: OPENROUTER_ENDPOINT,
    description: "tool-capable models from many vendors through one API",
    examples: OPENROUTER_MODELS,
  },
  {
    kind: "ollama",
    label: "Ollama",
    transport: "ollama-chat",
    credentialEnvironmentVariable: null,
    endpoint: "http://127.0.0.1:11434",
    description: "local no-key model runtime",
    examples: OLLAMA_MODELS,
  },
] as const;

export function productProviderDescriptor(
  kind: ProductProviderKind,
): ProductProviderDescriptor {
  const descriptor = PRODUCT_PROVIDER_REGISTRY.find((candidate) => candidate.kind === kind);
  if (descriptor === undefined) throw new Error(`Unknown product provider: ${kind}`);
  return descriptor;
}

export function isProductProviderKind(value: string): value is ProductProviderKind {
  return (PRODUCT_PROVIDER_KINDS as readonly string[]).includes(value);
}
