import {
  MODEL_REASONING_EFFORTS,
  isModelReasoningEffort,
  type ModelReasoningEffort,
} from "../domain/model.js";

export interface ModelReasoningCapabilities {
  /** Explicit effort sent when a user accepts the catalog default. */
  readonly defaultEffort: ModelReasoningEffort | null;
  /** Ordered from least to most reasoning work. */
  readonly supportedEfforts: readonly ModelReasoningEffort[];
  /** A mandatory model cannot expose `none`. */
  readonly mandatory: boolean;
}

export const NO_REASONING_CAPABILITIES: ModelReasoningCapabilities = {
  defaultEffort: null,
  supportedEfforts: [],
  mandatory: false,
};

export const ADVANCED_REASONING_CHOICE_ID = "__seh_advanced_reasoning__";

export interface ModelReasoningChoice {
  readonly id: ModelReasoningEffort | typeof ADVANCED_REASONING_CHOICE_ID;
  readonly effort: ModelReasoningEffort | null;
  readonly label: string;
  readonly description: string;
}

export function normalizeReasoningCapabilities(input: {
  readonly defaultEffort?: string | null;
  readonly supportedEfforts?: readonly string[] | null;
  readonly mandatory?: boolean;
  /** OpenRouter uses null to advertise every gateway effort. */
  readonly nullMeansAll?: boolean;
}): ModelReasoningCapabilities {
  const mandatory = input.mandatory === true;
  const advertised =
    input.supportedEfforts === null && input.nullMeansAll === true
      ? MODEL_REASONING_EFFORTS
      : (input.supportedEfforts ?? []);
  const accepted = new Set<ModelReasoningEffort>();
  for (const value of advertised) {
    if (isModelReasoningEffort(value) && !(mandatory && value === "none")) {
      accepted.add(value);
    }
  }
  const supportedEfforts = MODEL_REASONING_EFFORTS.filter((effort) => accepted.has(effort));
  const defaultEffort =
    typeof input.defaultEffort === "string" &&
    isModelReasoningEffort(input.defaultEffort) &&
    supportedEfforts.includes(input.defaultEffort)
      ? input.defaultEffort
      : null;
  return { defaultEffort, supportedEfforts, mandatory };
}

export function reasoningEffortLabel(effort: ModelReasoningEffort): string {
  switch (effort) {
    case "none":
      return "None";
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra high";
    case "max":
      return "Max";
  }
}

export function reasoningEffortDescription(effort: ModelReasoningEffort): string {
  switch (effort) {
    case "none":
      return "No explicit reasoning · lowest-latency baseline";
    case "minimal":
      return "Very light reasoning for simple work";
    case "low":
      return "Light reasoning · faster and lower usage";
    case "medium":
      return "Balanced reasoning for everyday coding";
    case "high":
      return "Deeper reasoning for complex changes";
    case "xhigh":
      return "Extra reasoning for difficult, verification-heavy work";
    case "max":
      return "Highest single-model effort · slowest and highest usage";
  }
}

export function reasoningCapabilitiesSummary(
  capabilities: ModelReasoningCapabilities,
): string | null {
  const { supportedEfforts } = capabilities;
  if (supportedEfforts.length === 0) return null;
  const first = supportedEfforts[0];
  const last = supportedEfforts.at(-1);
  if (first === undefined || last === undefined) return null;
  const range = first === last ? first : `${first}→${last}`;
  const defaultLabel =
    capabilities.defaultEffort === null ? "provider default" : `default ${capabilities.defaultEffort}`;
  return `reasoning ${range} · ${defaultLabel}${capabilities.mandatory ? " · required" : ""}`;
}

export function selectDefaultReasoningEffort(
  capabilities: ModelReasoningCapabilities,
): ModelReasoningEffort | null {
  return capabilities.defaultEffort ?? capabilities.supportedEfforts[0] ?? null;
}

export function reasoningEffortIsSupported(
  capabilities: ModelReasoningCapabilities,
  effort: ModelReasoningEffort,
): boolean {
  return capabilities.supportedEfforts.length === 0 || capabilities.supportedEfforts.includes(effort);
}

export function buildReasoningEffortChoices(input: {
  readonly capabilities: ModelReasoningCapabilities;
  readonly current: ModelReasoningEffort | null;
  readonly advanced?: boolean;
}): readonly ModelReasoningChoice[] {
  const advanced = input.advanced === true;
  const efforts = input.capabilities.supportedEfforts.filter((effort) =>
    advanced ? effort === "max" : effort !== "max",
  );
  const choices: ModelReasoningChoice[] = efforts.map((effort) => {
    const markers = [
      effort === input.current ? "current" : null,
      effort === input.capabilities.defaultEffort ? "model default" : null,
      effort === "max" ? "advanced" : null,
    ].filter((marker): marker is string => marker !== null);
    return {
      id: effort,
      effort,
      label: `${effort === input.current ? "●" : "○"} ${reasoningEffortLabel(effort)}`,
      description: `${reasoningEffortDescription(effort)}${
        markers.length === 0 ? "" : ` · ${markers.join(" · ")}`
      }`,
    };
  });
  if (
    !advanced &&
    input.capabilities.supportedEfforts.includes("max")
  ) {
    choices.push({
      id: ADVANCED_REASONING_CHOICE_ID,
      effort: null,
      label: `${input.current === "max" ? "●" : "◇"} More reasoning…`,
      description:
        "Open Max · highest single-model effort · Ultra requires proactive multi-agent orchestration",
    });
  }
  return choices;
}
