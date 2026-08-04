import type { ProductProviderConfig } from "./config.js";
import type { ModelReasoningCapabilities } from "./model-profile.js";
import {
  NO_REASONING_CAPABILITIES,
  reasoningCapabilitiesSummary,
} from "./model-profile.js";
import {
  PRODUCT_PROVIDER_REGISTRY,
  type ProductModelServiceTier,
  type ProductProviderKind,
  productProviderDescriptor,
} from "./provider-registry.js";

export const CUSTOM_MODEL_CHOICE_ID = "__seh_custom_model__";

export type ProductModelChoiceSource =
  | "current"
  | "discovered"
  | "example"
  | "custom";

export interface DiscoveredProductModel {
  readonly modelId: string;
  readonly name?: string;
  readonly description?: string;
  readonly reasoning?: ModelReasoningCapabilities;
  readonly serviceTiers?: readonly ProductModelServiceTier[];
}

export interface ProductModelChoice {
  readonly id: string;
  readonly providerKind: ProductProviderKind;
  readonly modelId: string | null;
  readonly label: string;
  readonly description: string;
  readonly source: ProductModelChoiceSource;
  readonly reasoning: ModelReasoningCapabilities;
  readonly serviceTiers: readonly ProductModelServiceTier[];
}

interface ProductModelCatalogInput {
  readonly provider: ProductProviderConfig;
  /** Backward-compatible current-provider discovery input. */
  readonly discoveredModels?: readonly string[];
  readonly discoveredByProvider?: Partial<
    Readonly<Record<ProductProviderKind, readonly DiscoveredProductModel[]>>
  >;
}

function modelChoiceId(providerKind: ProductProviderKind, modelId: string): string {
  return `model:${providerKind}:${encodeURIComponent(modelId)}`;
}

export function customModelChoiceId(providerKind: ProductProviderKind): string {
  return `${CUSTOM_MODEL_CHOICE_ID}:${providerKind}`;
}

function normalizedDiscovery(
  input: ProductModelCatalogInput,
  providerKind: ProductProviderKind,
): readonly DiscoveredProductModel[] {
  const candidates: DiscoveredProductModel[] = [
    ...(input.discoveredByProvider?.[providerKind] ?? []),
    ...(providerKind === input.provider.kind
      ? (input.discoveredModels ?? []).map((modelId) => ({ modelId }))
      : []),
  ];
  const byId = new Map<string, DiscoveredProductModel>();
  for (const candidate of candidates) {
    const modelId = candidate.modelId.trim();
    if (modelId.length === 0 || byId.has(modelId)) continue;
    byId.set(modelId, {
      modelId,
      ...(candidate.name?.trim() ? { name: candidate.name.trim() } : {}),
      ...(candidate.description?.trim()
        ? { description: candidate.description.trim() }
        : {}),
      ...(candidate.reasoning === undefined ? {} : { reasoning: candidate.reasoning }),
      ...(candidate.serviceTiers === undefined ? {} : { serviceTiers: candidate.serviceTiers }),
    });
  }
  return [...byId.values()].sort((left, right) =>
    (left.name ?? left.modelId).localeCompare(right.name ?? right.modelId),
  );
}

function credentialHint(providerKind: ProductProviderKind): string {
  const credential = productProviderDescriptor(providerKind).credentialEnvironmentVariable;
  return credential === null ? "local runtime" : `requires ${credential}`;
}

/**
 * Build one searchable, provider-aware model catalog. Catalog entries describe
 * possible routes; only a live discovery result proves endpoint visibility and
 * neither source proves account entitlement until the first authenticated call.
 */
export function buildProductModelChoices(
  input: ProductModelCatalogInput,
): readonly ProductModelChoice[] {
  const choices: ProductModelChoice[] = [];
  const seen = new Set<string>();
  const currentDescriptor = productProviderDescriptor(input.provider.kind);
  const currentCatalogEntry = currentDescriptor.examples.find(
    (entry) => entry.modelId === input.provider.model,
  );
  const currentDiscovered = normalizedDiscovery(input, input.provider.kind).find(
    (entry) => entry.modelId === input.provider.model,
  );
  const currentReasoning =
    currentDiscovered?.reasoning ?? currentCatalogEntry?.reasoning ?? NO_REASONING_CAPABILITIES;
  const currentReasoningSummary = reasoningCapabilitiesSummary(currentReasoning);
  choices.push({
    id: modelChoiceId(input.provider.kind, input.provider.model),
    providerKind: input.provider.kind,
    modelId: input.provider.model,
    label: `● ${currentDescriptor.label}  ${currentCatalogEntry?.name ?? input.provider.model}`,
    description: `current · ${input.provider.kind}/${input.provider.model}${
      currentDiscovered === undefined ? "" : " · discovered live"
    }${currentReasoningSummary === null ? "" : ` · ${currentReasoningSummary}`}`,
    source: "current",
    reasoning: currentReasoning,
    serviceTiers: currentDiscovered?.serviceTiers ?? currentCatalogEntry?.serviceTiers ?? [],
  });
  seen.add(`${input.provider.kind}\u0000${input.provider.model}`);

  const providerOrder = [
    currentDescriptor,
    ...PRODUCT_PROVIDER_REGISTRY.filter(
      (descriptor) => descriptor.kind !== currentDescriptor.kind,
    ),
  ];
  const addDiscovered = (
    descriptor: (typeof PRODUCT_PROVIDER_REGISTRY)[number],
    discovered: DiscoveredProductModel,
  ): void => {
    const key = `${descriptor.kind}\u0000${discovered.modelId}`;
    if (seen.has(key)) return;
    const reasoning = discovered.reasoning ?? NO_REASONING_CAPABILITIES;
    const reasoningSummary = reasoningCapabilitiesSummary(reasoning);
    choices.push({
      id: modelChoiceId(descriptor.kind, discovered.modelId),
      providerKind: descriptor.kind,
      modelId: discovered.modelId,
      label: `✓ ${descriptor.label}  ${discovered.name ?? discovered.modelId}`,
      description: `live catalog · ${discovered.modelId}${
        discovered.description === undefined ? "" : ` · ${discovered.description}`
      }${reasoningSummary === null || discovered.description?.includes("reasoning ") === true ? "" : ` · ${reasoningSummary}`} · ${credentialHint(descriptor.kind)}`,
      source: "discovered",
      reasoning,
      serviceTiers: discovered.serviceTiers ?? [],
    });
    seen.add(key);
  };
  const addExample = (
    descriptor: (typeof PRODUCT_PROVIDER_REGISTRY)[number],
    example: (typeof descriptor.examples)[number],
  ): void => {
    const key = `${descriptor.kind}\u0000${example.modelId}`;
    if (seen.has(key)) return;
    const reasoning = example.reasoning ?? NO_REASONING_CAPABILITIES;
    const reasoningSummary = reasoningCapabilitiesSummary(reasoning);
    choices.push({
      id: modelChoiceId(descriptor.kind, example.modelId),
      providerKind: descriptor.kind,
      modelId: example.modelId,
      label: `○ ${descriptor.label}  ${example.name}`,
      description: `catalog · ${example.modelId} · ${example.description}${
        reasoningSummary === null ? "" : ` · ${reasoningSummary}`
      } · ${credentialHint(descriptor.kind)}`,
      source: "example",
      reasoning,
      serviceTiers: example.serviceTiers ?? [],
    });
    seen.add(key);
  };

  // Keep the first screen useful: current route, two live siblings, then two
  // representative routes from every provider before the full catalog.
  for (const discovered of normalizedDiscovery(input, currentDescriptor.kind)
    .filter((candidate) => !seen.has(`${currentDescriptor.kind}\u0000${candidate.modelId}`))
    .slice(0, 2)) {
    addDiscovered(currentDescriptor, discovered);
  }
  for (const descriptor of PRODUCT_PROVIDER_REGISTRY) {
    const discovered = normalizedDiscovery(input, descriptor.kind);
    for (const example of descriptor.examples.slice(0, 2)) {
      const live = discovered.find((candidate) => candidate.modelId === example.modelId);
      if (live === undefined) addExample(descriptor, example);
      else addDiscovered(descriptor, live);
    }
  }
  for (const descriptor of providerOrder) {
    for (const discovered of normalizedDiscovery(input, descriptor.kind)) {
      addDiscovered(descriptor, discovered);
    }
  }
  for (const descriptor of providerOrder) {
    for (const example of descriptor.examples) addExample(descriptor, example);
  }
  for (const descriptor of providerOrder) {
    choices.push({
      id: customModelChoiceId(descriptor.kind),
      providerKind: descriptor.kind,
      modelId: null,
      label: `+ ${descriptor.label}  Enter another model ID`,
      description: `${descriptor.description} · ${credentialHint(descriptor.kind)}`,
      source: "custom",
      reasoning: NO_REASONING_CAPABILITIES,
      serviceTiers: [],
    });
  }
  return choices;
}
