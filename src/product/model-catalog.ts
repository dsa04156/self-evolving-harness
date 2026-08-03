import type { ProductProviderConfig } from "./config.js";

export const CUSTOM_MODEL_CHOICE_ID = "__seh_custom_model__";

export type ProductModelChoiceSource =
  | "current"
  | "discovered"
  | "example"
  | "custom";

export interface ProductModelChoice {
  readonly id: string;
  readonly modelId: string | null;
  readonly label: string;
  readonly description: string;
  readonly source: ProductModelChoiceSource;
}

interface ProductModelCatalogInput {
  readonly provider: ProductProviderConfig;
  readonly discoveredModels?: readonly string[];
}

interface CatalogEntry {
  readonly modelId: string;
  readonly description: string;
}

const OPENAI_EXAMPLES: readonly CatalogEntry[] = [
  {
    modelId: "gpt-5.6-sol",
    description: "flagship coding and agentic work · account access may vary",
  },
  {
    modelId: "gpt-5.6-terra",
    description: "balanced cost and throughput · account access may vary",
  },
  {
    modelId: "gpt-5.6-luna",
    description: "fast, high-volume tasks · account access may vary",
  },
] as const;

const OLLAMA_EXAMPLES: readonly CatalogEntry[] = [
  {
    modelId: "qwen3-coder:30b",
    description: "agentic coding example · pull before first use",
  },
  {
    modelId: "qwen2.5-coder:7b",
    description: "lighter coding example · pull before first use",
  },
  {
    modelId: "qwen2.5-coder:14b",
    description: "mid-size coding example · pull before first use",
  },
  {
    modelId: "qwen2.5-coder:32b",
    description: "larger coding example · pull before first use",
  },
] as const;

function modelChoiceId(modelId: string): string {
  return `model:${encodeURIComponent(modelId)}`;
}

/**
 * Build a presentation-only model catalog. A catalog entry is never treated as
 * proof of local installation or account entitlement; only provider discovery
 * can produce a `discovered` choice.
 */
export function buildProductModelChoices(
  input: ProductModelCatalogInput,
): readonly ProductModelChoice[] {
  const discovered = [
    ...new Set((input.discoveredModels ?? []).map((model) => model.trim())),
  ]
    .filter((model) => model.length > 0)
    .sort();
  const discoveredSet = new Set(discovered);
  const seen = new Set<string>();
  const choices: ProductModelChoice[] = [];

  const currentDescription = discoveredSet.has(input.provider.model)
    ? "current · discovered from provider"
    : input.discoveredModels === undefined
      ? "current · configured"
      : "current · not discovered from provider";
  choices.push({
    id: modelChoiceId(input.provider.model),
    modelId: input.provider.model,
    label: `● ${input.provider.model}`,
    description: currentDescription,
    source: "current",
  });
  seen.add(input.provider.model);

  for (const modelId of discovered) {
    if (seen.has(modelId)) continue;
    choices.push({
      id: modelChoiceId(modelId),
      modelId,
      label: `✓ ${modelId}`,
      description: "discovered from provider",
      source: "discovered",
    });
    seen.add(modelId);
  }

  const examples = input.provider.kind === "openai" ? OPENAI_EXAMPLES : OLLAMA_EXAMPLES;
  for (const example of examples) {
    if (seen.has(example.modelId)) continue;
    choices.push({
      id: modelChoiceId(example.modelId),
      modelId: example.modelId,
      label: `○ ${example.modelId}`,
      description: `example · ${example.description}`,
      source: "example",
    });
    seen.add(example.modelId);
  }

  choices.push({
    id: CUSTOM_MODEL_CHOICE_ID,
    modelId: null,
    label: "+ Enter another model ID",
    description: `use any model supported by ${input.provider.kind}`,
    source: "custom",
  });
  return choices;
}
