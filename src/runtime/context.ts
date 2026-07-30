import { sha256, sha256Text, type JsonValue } from "../core/canonical.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type { ModelInputItem, ModelTool } from "../domain/model.js";
import { estimateTokens, type RankedMemory } from "./memory.js";
import type { DeclarativeSkill } from "./skills.js";

export type ContextSource =
  | "task_input"
  | "system_prompt"
  | "tool_catalog"
  | "session_events"
  | "tool_results"
  | "selected_memory"
  | "selected_skills"
  | "verification_feedback";

export interface ContextPolicy {
  readonly totalTokenLimit: number;
  readonly sources: readonly {
    readonly source: ContextSource;
    readonly priority: number;
    readonly maxTokens: number;
    readonly selection: "all_in_order" | "latest_first" | "earliest_first" | "deterministic_rank";
  }[];
  readonly overflowPolicy:
    | "drop_lowest_priority"
    | "truncate_oldest_with_receipt"
    | "block";
}

export interface PromptPayload {
  readonly sections: readonly {
    readonly sectionId: string;
    readonly purpose:
      | "identity"
      | "system_rules"
      | "task_method"
      | "tool_guidance"
      | "completion"
      | "recovery"
      | "subagent_role";
    readonly content: string;
  }[];
}

export interface ContextManifestEntry {
  readonly source: ContextSource;
  readonly sourceId: string;
  readonly contentHash: string;
  readonly estimatedTokens: number;
  readonly selected: boolean;
  readonly reason: "selected" | "source_disabled" | "source_limit" | "total_limit";
}

export interface ConstructedContext {
  readonly instructions: string;
  readonly input: readonly ModelInputItem[];
  readonly tools: readonly ModelTool[];
  readonly manifest: {
    readonly entries: readonly ContextManifestEntry[];
    readonly estimatedTokens: number;
    readonly manifestHash: string;
  };
}

interface TextCandidate {
  readonly source: ContextSource;
  readonly sourceId: string;
  readonly text: string;
  readonly role: "system" | "user" | "assistant";
  readonly order: number;
  readonly rank: number;
}

function renderSkill(skill: DeclarativeSkill): string {
  return [
    `Skill ${skill.skillId}: ${skill.summary}`,
    ...skill.steps.map((step) => `[${step.kind}] ${step.instruction}`),
    ...skill.completionChecks.map((check) => `[completion] ${check}`),
  ].join("\n");
}

export class ContextBuilder {
  readonly #policy: ContextPolicy;

  public constructor(policy: ContextPolicy) {
    const unique = new Set(policy.sources.map((source) => source.source));
    assertCondition(unique.size === policy.sources.length, "SCHEMA_INVALID", "Duplicate context source");
    this.#policy = policy;
  }

  public construct(input: {
    task: string;
    prompt: PromptPayload;
    transcript: readonly ModelInputItem[];
    memory: readonly RankedMemory[];
    skills: readonly DeclarativeSkill[];
    verificationFeedback: string | null;
    tools: readonly ModelTool[];
  }): ConstructedContext {
    const candidates: TextCandidate[] = [];
    let order = 0;
    const add = (
      source: ContextSource,
      sourceId: string,
      text: string,
      role: TextCandidate["role"],
      rank = 0,
    ): void => {
      candidates.push({ source, sourceId, text, role, order, rank });
      order += 1;
    };
    add("task_input", "task.primary", input.task, "user");
    for (const section of input.prompt.sections) {
      add("system_prompt", `prompt.${section.sectionId}`, section.content, "system");
    }
    for (const [index, memory] of input.memory.entries()) {
      add(
        "selected_memory",
        memory.record.recordId,
        `<memory authority="${memory.record.authority}">\n${memory.record.content}\n</memory>`,
        "system",
        memory.scoreMicros,
      );
    }
    for (const skill of input.skills) {
      add("selected_skills", `skill.${skill.skillId}`, renderSkill(skill), "system");
    }
    if (input.verificationFeedback !== null) {
      add(
        "verification_feedback",
        "verification.latest",
        input.verificationFeedback,
        "system",
      );
    }
    for (const [index, tool] of input.tools.entries()) {
      add(
        "tool_catalog",
        `tool.${tool.toolId}`,
        `${tool.name}: ${tool.description}`,
        "system",
        input.tools.length - index,
      );
    }

    const manifest: ContextManifestEntry[] = [];
    const selected: TextCandidate[] = [];
    let total = 0;
    const policyBySource = new Map(this.#policy.sources.map((rule) => [rule.source, rule]));
    for (const candidate of candidates) {
      if (!policyBySource.has(candidate.source)) {
        manifest.push({
          source: candidate.source,
          sourceId: candidate.sourceId,
          contentHash: sha256Text(candidate.text),
          estimatedTokens: estimateTokens(candidate.text),
          selected: false,
          reason: "source_disabled",
        });
      }
    }
    const orderedRules = [...this.#policy.sources].sort(
      (left, right) => right.priority - left.priority || left.source.localeCompare(right.source),
    );
    for (const rule of orderedRules) {
      let sourceCandidates = candidates.filter((candidate) => candidate.source === rule.source);
      if (rule.selection === "latest_first") {
        sourceCandidates = sourceCandidates.sort((left, right) => right.order - left.order);
      } else if (rule.selection === "earliest_first" || rule.selection === "all_in_order") {
        sourceCandidates = sourceCandidates.sort((left, right) => left.order - right.order);
      } else {
        sourceCandidates = sourceCandidates.sort(
          (left, right) =>
            right.rank - left.rank ||
            left.sourceId.localeCompare(right.sourceId) ||
            left.order - right.order,
        );
      }
      let sourceTokens = 0;
      for (const candidate of sourceCandidates) {
        const tokens = estimateTokens(candidate.text);
        let reason: ContextManifestEntry["reason"] = "selected";
        let isSelected = true;
        if (sourceTokens + tokens > rule.maxTokens) {
          isSelected = false;
          reason = "source_limit";
        } else if (total + tokens > this.#policy.totalTokenLimit) {
          if (this.#policy.overflowPolicy === "block") {
            throw new HarnessError("BUDGET_EXHAUSTED", "Context token limit exceeded");
          }
          isSelected = false;
          reason = "total_limit";
        }
        manifest.push({
          source: candidate.source,
          sourceId: candidate.sourceId,
          contentHash: sha256Text(candidate.text),
          estimatedTokens: tokens,
          selected: isSelected,
          reason,
        });
        if (isSelected) {
          selected.push(candidate);
          sourceTokens += tokens;
          total += tokens;
        }
      }
    }

    const selectedSystem = selected
      .filter((candidate) => candidate.role === "system" && candidate.source !== "tool_catalog")
      .sort((left, right) => left.order - right.order)
      .map((candidate) => candidate.text);
    const selectedInput: ModelInputItem[] = selected
      .filter((candidate) => candidate.role !== "system" && candidate.source !== "tool_catalog")
      .sort((left, right) => left.order - right.order)
      .map((candidate) => ({
        kind: "text",
        role: candidate.role,
        content: candidate.text,
      }));
    selectedInput.push(...input.transcript);
    const manifestIdentity = {
      entries: manifest,
      estimatedTokens: total,
    };
    return {
      instructions: selectedSystem.join("\n\n"),
      input: selectedInput,
      tools: input.tools,
      manifest: {
        ...manifestIdentity,
        manifestHash: sha256(manifestIdentity),
      },
    };
  }
}
