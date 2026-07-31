import {
  canonicalize,
  parseStrictJson,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";
import { SCHEMA_BASE_URL, type SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  ArtifactReference,
  ComponentManifest,
  HarnessVersionManifest,
} from "../domain/components.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import type { ArtifactStore } from "../storage/artifact-store.js";
import type { PrincipalRole } from "../trust/identity.js";

export const HFB_FIXTURE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/harness-fault-fixture.schema.json`;
export const HFB_CAUSAL_REPORT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/harness-fault-causal-report.schema.json`;
export const HFB_MINE_COMMITMENT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/harness-fault-mine-commitment.schema.json`;
export const HFB_SCORE_REPORT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/harness-fault-score-report.schema.json`;
export const HFB_FIXTURE_SPEC_VERSION = "hfb-fixture-spec-1.0.1";
export const HFB_SCORER_VERSION = "hfb-scorer-1.0.1";

const HFB_RUNTIME_CONTRACT_HASH = sha256({
  contract: "hfb-deterministic-runtime",
  version: HFB_FIXTURE_SPEC_VERSION,
});
const FIXED_AUTHORED_AT = "2026-07-31T00:00:00.000Z";
const FIXED_REVIEWED_AT = "2026-07-31T00:01:00.000Z";

export type HfbSplitRole = "mine" | "gate" | "sealed_test";
export type HfbDifficulty = "low" | "medium" | "high";
export type HfbMutableComponentType =
  | "SystemPrompt"
  | "ContextPolicy"
  | "MemoryRetrievalPolicy"
  | "Skill"
  | "WorkflowPolicy"
  | "RoutingPolicy"
  | "SubagentPrompt"
  | "ToolDescription";

export interface HfbPatchOperation {
  readonly op: "add" | "remove" | "replace" | "move";
  readonly path: string;
  readonly from?: string;
  readonly value?: JsonValue;
}

export interface HfbFault {
  readonly componentId: string;
  readonly componentType: HfbMutableComponentType;
  readonly typeEntryId: string;
  readonly mechanismCode: string;
  readonly patch: readonly HfbPatchOperation[];
}

export interface HfbProviderRow {
  readonly state: string;
  readonly requiredContextFactIds: readonly string[];
  readonly lastToolStatus: "none" | "ok" | "error" | "denied";
  readonly action: {
    readonly kind:
      | "emit_text"
      | "request_tool"
      | "request_subagent"
      | "complete";
    readonly targetId: string | null;
    readonly argumentFixtureId: string | null;
  };
  readonly nextState: string;
}

export interface HfbToolRow {
  readonly toolId:
    | "read"
    | "write"
    | "edit"
    | "bash"
    | "git_status"
    | "git_diff";
  readonly argumentFixtureId: string;
  readonly status: "ok" | "error" | "denied";
  readonly result: ArtifactReference;
}

export interface HfbFixtureDocument {
  readonly schemaVersion: 1;
  readonly specVersion: typeof HFB_FIXTURE_SPEC_VERSION;
  readonly fixtureId: string;
  readonly splitRole: HfbSplitRole;
  readonly difficulty: HfbDifficulty;
  readonly knownGoodHarnessVersionId: string;
  readonly faultyHarnessVersionId: string;
  readonly faults: readonly HfbFault[];
  readonly taskInput: ArtifactReference;
  readonly initialState: ArtifactReference;
  readonly fakeProviderTable: readonly HfbProviderRow[];
  readonly fakeToolTable: readonly HfbToolRow[];
  readonly expected: {
    readonly knownGoodPassed: true;
    readonly faultyPassed: false;
    readonly knownGoodEventChainHash: string;
    readonly faultyEventChainHash: string;
    readonly faultyTerminalReason: string;
  };
  readonly causalInterventions: {
    readonly restoreNonePassed: false;
    readonly restoreEachSingleFaultPassed: readonly boolean[];
    readonly restoreAllFaultsPassed: true;
    readonly restoreNonGroundTruthComponentPassed: false;
    readonly replayCount: 3;
    readonly replayHashesIdentical: true;
  };
  readonly authorship: {
    readonly authorId: string;
    readonly reviewerId: string;
    readonly authoredAt: string;
    readonly reviewedAt: string;
    readonly authorHadCandidateResultAccess: false;
    readonly reviewerHadCandidateResultAccess: false;
  };
  readonly contentHash: string;
}

export interface HfbTraceEvent {
  readonly sequence: number;
  readonly eventType:
    | "fixture_started"
    | "provider_transition"
    | "tool_result"
    | "verifier_outcome"
    | "fixture_completed";
  readonly payloadHash: string;
}

export interface HfbExecutionResult {
  readonly fixtureId: string;
  readonly harnessVersionId: string;
  readonly passed: boolean;
  readonly terminalReason: string;
  readonly events: readonly HfbTraceEvent[];
  readonly eventChainHash: string;
}

export interface HfbCausalValidationReport {
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly fixtureContentHash: string;
  readonly knownGoodPassed: true;
  readonly faultyPassed: false;
  readonly singleChangedComponent: true;
  readonly declaredPatchMatchesPayloads: true;
  readonly groundTruthRestorationPassed: true;
  readonly nonGroundTruthRestorationPassed: false;
  readonly replayCount: 3;
  readonly replayHashesIdentical: true;
  readonly staticRegistryValidationPassed: true;
  readonly immutableTrustPinsIdentical: true;
  readonly capabilitySetUnchanged: true;
  readonly reportHash: string;
}

export interface HfbBuiltMineFixture {
  readonly document: HfbFixtureDocument;
  readonly knownGoodTargetManifestId: string;
  readonly faultyTargetManifestId: string;
  readonly causalReport: HfbCausalValidationReport;
}

interface HfbCaseDefinition {
  readonly fixtureId: string;
  readonly difficulty: HfbDifficulty;
  readonly componentType: HfbMutableComponentType;
  readonly typeEntryId: string;
  readonly mechanismCode: string;
  readonly goodPayload: JsonValue;
  readonly patch: HfbPatchOperation;
}

interface ComponentDescriptor {
  readonly slotId: string;
  readonly typeEntryId: string;
  readonly payloadLanguage: string;
  readonly capabilityIds: readonly string[];
}

const COMPONENT_DESCRIPTORS: Readonly<
  Record<HfbMutableComponentType, ComponentDescriptor>
> = Object.freeze({
  SystemPrompt: {
    slotId: "system_prompt",
    typeEntryId: "type.system-prompt",
    payloadLanguage: "seh.prompt-markdown.v1",
    capabilityIds: ["prompt.instruct.primary"],
  },
  ContextPolicy: {
    slotId: "context_policy",
    typeEntryId: "type.context-policy",
    payloadLanguage: "seh.context-policy.v1",
    capabilityIds: [
      "context.read.session",
      "context.read.task",
      "context.read.tool-catalog",
      "context.read.tool-results",
    ],
  },
  MemoryRetrievalPolicy: {
    slotId: "memory_retrieval_policy",
    typeEntryId: "type.memory-retrieval-policy",
    payloadLanguage: "seh.memory-retrieval-policy.v1",
    capabilityIds: [
      "memory.read.accepted-lessons",
      "memory.read.project-facts",
    ],
  },
  Skill: {
    slotId: "skill",
    typeEntryId: "type.skill",
    payloadLanguage: "seh.skill.v1",
    capabilityIds: ["skill.guide", "skill.reference.existing-tool"],
  },
  WorkflowPolicy: {
    slotId: "workflow_policy",
    typeEntryId: "type.workflow-policy",
    payloadLanguage: "seh.workflow.v1",
    capabilityIds: ["workflow.dispatch.closed-action"],
  },
  RoutingPolicy: {
    slotId: "routing_policy",
    typeEntryId: "type.routing-policy",
    payloadLanguage: "seh.routing-policy.v1",
    capabilityIds: ["routing.select.primary", "routing.select.subagent"],
  },
  SubagentPrompt: {
    slotId: "subagent_prompt",
    typeEntryId: "type.subagent-prompt",
    payloadLanguage: "seh.prompt-markdown.v1",
    capabilityIds: ["prompt.instruct.subagent"],
  },
  ToolDescription: {
    slotId: "tool_description",
    typeEntryId: "type.tool-description",
    payloadLanguage: "seh.tool-description.v1",
    capabilityIds: ["tool.describe.existing"],
  },
});

const COMPONENT_ORDER: readonly HfbMutableComponentType[] = [
  "SystemPrompt",
  "ContextPolicy",
  "MemoryRetrievalPolicy",
  "Skill",
  "WorkflowPolicy",
  "RoutingPolicy",
  "SubagentPrompt",
  "ToolDescription",
];

function cloneJson<T extends JsonValue>(value: T): T {
  return parseStrictJson(canonicalize(value)) as T;
}

function pointerParts(pointer: string): string[] {
  assertCondition(
    pointer.startsWith("/") && pointer.length > 1,
    "SCHEMA_INVALID",
    "Fixture patch path must be a non-root JSON Pointer",
  );
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/gu, "/").replace(/~0/gu, "~"))
    .map((part) => {
      assertCondition(
        !["__proto__", "prototype", "constructor"].includes(part),
        "AUTHORIZATION_DENIED",
        "Prototype mutation is forbidden",
      );
      return part;
    });
}

function locateParent(
  root: JsonValue,
  pointer: string,
): { readonly parent: JsonValue; readonly leaf: string } {
  const parts = pointerParts(pointer);
  let parent = root;
  for (const part of parts.slice(0, -1)) {
    if (Array.isArray(parent)) {
      const index = Number(part);
      assertCondition(
        Number.isSafeInteger(index) && index >= 0 && index < parent.length,
        "SCHEMA_INVALID",
        `Invalid fixture array pointer ${pointer}`,
      );
      parent = parent[index]!;
    } else {
      assertCondition(
        typeof parent === "object" && parent !== null && part in parent,
        "SCHEMA_INVALID",
        `Missing fixture pointer ${pointer}`,
      );
      parent = parent[part]!;
    }
  }
  return { parent, leaf: parts.at(-1)! };
}

function readPointer(root: JsonValue, pointer: string): JsonValue {
  const { parent, leaf } = locateParent(root, pointer);
  if (Array.isArray(parent)) {
    const index = Number(leaf);
    assertCondition(
      Number.isSafeInteger(index) && index >= 0 && index < parent.length,
      "SCHEMA_INVALID",
      `Invalid fixture array pointer ${pointer}`,
    );
    return cloneJson(parent[index]!);
  }
  assertCondition(
    typeof parent === "object" && parent !== null && leaf in parent,
    "SCHEMA_INVALID",
    `Missing fixture pointer ${pointer}`,
  );
  return cloneJson(parent[leaf]!);
}

function removePointer(root: JsonValue, pointer: string): void {
  const { parent, leaf } = locateParent(root, pointer);
  if (Array.isArray(parent)) {
    const index = Number(leaf);
    assertCondition(
      Number.isSafeInteger(index) && index >= 0 && index < parent.length,
      "SCHEMA_INVALID",
      `Invalid fixture array pointer ${pointer}`,
    );
    parent.splice(index, 1);
    return;
  }
  assertCondition(
    typeof parent === "object" && parent !== null && leaf in parent,
    "SCHEMA_INVALID",
    `Missing fixture pointer ${pointer}`,
  );
  delete parent[leaf];
}

function addOrReplacePointer(
  root: JsonValue,
  operation: HfbPatchOperation,
): void {
  const { parent, leaf } = locateParent(root, operation.path);
  assertCondition(
    operation.value !== undefined,
    "SCHEMA_INVALID",
    `${operation.op} requires a value`,
  );
  const value = cloneJson(operation.value);
  if (Array.isArray(parent)) {
    const index = Number(leaf);
    assertCondition(
      Number.isSafeInteger(index) && index >= 0,
      "SCHEMA_INVALID",
      `Invalid fixture array index ${leaf}`,
    );
    if (operation.op === "add") {
      assertCondition(index <= parent.length, "SCHEMA_INVALID", "Fixture add is out of range");
      parent.splice(index, 0, value);
    } else {
      assertCondition(index < parent.length, "SCHEMA_INVALID", "Fixture replace is out of range");
      parent[index] = value;
    }
    return;
  }
  assertCondition(
    typeof parent === "object" && parent !== null,
    "SCHEMA_INVALID",
    "Fixture patch parent is not an object",
  );
  if (operation.op === "add") {
    assertCondition(!(leaf in parent), "CONFLICT", "Fixture add target exists");
  } else {
    assertCondition(leaf in parent, "SCHEMA_INVALID", "Fixture replace target is missing");
  }
  parent[leaf] = value;
}

export function applyHfbPatch(
  source: JsonValue,
  operations: readonly HfbPatchOperation[],
): JsonValue {
  assertCondition(
    operations.length >= 1 && operations.length <= 2,
    "SCHEMA_INVALID",
    "HarnessFaultBench supports one or two bounded patch operations",
  );
  const result = cloneJson(source);
  for (const operation of operations) {
    if (operation.op === "remove") {
      removePointer(result, operation.path);
    } else if (operation.op === "move") {
      assertCondition(operation.from !== undefined, "SCHEMA_INVALID", "Move requires from");
      const value = readPointer(result, operation.from);
      removePointer(result, operation.from);
      addOrReplacePointer(result, {
        op: "add",
        path: operation.path,
        value,
      });
    } else {
      addOrReplacePointer(result, operation);
    }
  }
  return result;
}

function promptPayload(
  purpose: "primary" | "subagent",
  sections: readonly {
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
  }[],
): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: cloneJson(sections as unknown as JsonValue),
    contextBindings:
      purpose === "primary"
        ? ["task_input", "tool_catalog", "verification_feedback"]
        : ["task_input", "tool_catalog"],
  };
}

function contextPayload(sources?: JsonValue[]): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.context-policy.v1",
    totalTokenLimit: 1024,
    sources:
      sources ??
      [
        {
          source: "task_input",
          priority: 1000,
          maxTokens: 256,
          selection: "all_in_order",
        },
        {
          source: "tool_results",
          priority: 900,
          maxTokens: 256,
          selection: "latest_first",
        },
      ],
    overflowPolicy: "drop_lowest_priority",
  };
}

function memoryPayload(overrides: Record<string, JsonValue> = {}): JsonValue {
  return {
    schemaVersion: 2,
    language: "seh.memory-retrieval-policy.v1",
    readableNamespaces: ["project_facts", "accepted_lessons"],
    queryMode: "lexical",
    maxRecords: 4,
    maxTokens: 512,
    minimumScoreMicros: 400_000,
    tieBreak: "record_id_ascending",
    ...overrides,
  };
}

function skillPayload(): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.skill.v1",
    skillId: "hfb.deterministic-edit",
    summary: "Inspect, edit, and verify the declared fixture artifact.",
    allowedToolIds: ["edit", "read"],
    steps: [
      {
        stepId: "inspect",
        kind: "tool_guidance",
        instruction: "Inspect the required file before editing.",
        toolId: "read",
      },
      {
        stepId: "edit",
        kind: "tool_guidance",
        instruction: "Apply the declared edit after inspection.",
        toolId: "edit",
      },
      {
        stepId: "evidence",
        kind: "evidence_check",
        instruction: "Inspect the verifier evidence before completion.",
      },
    ],
    completionChecks: ["The verifier result must equal PASS."],
  };
}

function workflowPayload(): JsonValue {
  const stateActions = [
    ["start", "construct_context"],
    ["context", "construct_context"],
    ["model", "model_turn"],
    ["recover", "model_turn"],
    ["verify", "verify"],
    ["pre_job", "wait_job"],
    ["post_job", "verify"],
    ["complete", "emit_completion"],
    ["blocked", "emit_block"],
  ] as const;
  const states = stateActions.map(([stateId, action]) => ({
    stateId,
    actions: [{ action, targetId: null }],
  }));
  return {
    schemaVersion: 1,
    language: "seh.workflow.v1",
    entryState: "start",
    states,
    transitions: [
      { from: "start", trigger: "action_succeeded", guard: "always", to: "context" },
      { from: "model", trigger: "action_failed", guard: "retry_remaining", to: "recover" },
      {
        from: "verify",
        trigger: "verification_failed",
        guard: "retry_remaining",
        to: "recover",
      },
      {
        from: "pre_job",
        trigger: "job_completed",
        guard: "evidence_complete",
        to: "post_job",
      },
      {
        from: "verify",
        trigger: "verification_passed",
        guard: "evidence_complete",
        to: "complete",
      },
    ],
    terminalStates: ["blocked", "complete"],
  };
}

function routingPayload(riskClass: "low" | "high" = "low"): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.routing-policy.v1",
    rules: [
      {
        ruleId: "target_rule",
        priority: 100,
        match: { taskClass: "code_change", riskClass },
        target: { kind: "subagent", routeId: "route.capable" },
      },
      {
        ruleId: "decoy_rule",
        priority: 10,
        match: { taskClass: "unknown", riskClass: "low" },
        target: { kind: "subagent", routeId: "route.decoy" },
      },
    ],
    defaultTarget: { kind: "primary", routeId: "route.primary" },
  };
}

function toolDescriptionPayload(): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.tool-description.v1",
    toolId: "read",
    implementationSchemaHash: sha256({ schema: "hfb-read-tool-input-v1" }),
    summary: "Read a declared relative file without changing it.",
    usageNotes: [
      "Inspect before edit; mode exact replaces the declared match.",
      "The result field contains the requested file bytes.",
      "git_diff reports the requested path scope.",
    ],
    parameterDescriptions: [
      {
        jsonPointer: "/path",
        description: "Relative path of the file to read.",
      },
    ],
  };
}

function genericPayload(type: HfbMutableComponentType): JsonValue {
  switch (type) {
    case "SystemPrompt":
      return promptPayload("primary", [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Solve the deterministic fixture.",
        },
      ]);
    case "ContextPolicy":
      return contextPayload();
    case "MemoryRetrievalPolicy":
      return memoryPayload();
    case "Skill":
      return skillPayload();
    case "WorkflowPolicy":
      return workflowPayload();
    case "RoutingPolicy":
      return routingPayload();
    case "SubagentPrompt":
      return promptPayload("subagent", [
        {
          sectionId: "role",
          purpose: "subagent_role",
          content: "Return the requested artifact with evidence.",
        },
      ]);
    case "ToolDescription":
      return toolDescriptionPayload();
  }
}

function difficultyFor(index: number): HfbDifficulty {
  if (index === 1 || index === 4) return "low";
  if (index === 2) return "medium";
  return "high";
}

function fixtureId(family: string, index: number): string {
  return `hfb-v0-${family}-${String(index).padStart(2, "0")}`;
}

function defineCase(
  family: string,
  index: number,
  componentType: HfbMutableComponentType,
  mechanismCode: string,
  goodPayload: JsonValue,
  patch: HfbPatchOperation,
): HfbCaseDefinition {
  return {
    fixtureId: fixtureId(family, index),
    difficulty: difficultyFor(index),
    componentType,
    typeEntryId: COMPONENT_DESCRIPTORS[componentType].typeEntryId,
    mechanismCode,
    goodPayload,
    patch,
  };
}

function mineCaseDefinitions(): readonly HfbCaseDefinition[] {
  const systemPrompt = [
    defineCase(
      "system-prompt",
      1,
      "SystemPrompt",
      "SP_OMIT_OUTPUT_CONTRACT",
      promptPayload("primary", [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Solve the deterministic fixture.",
        },
        {
          sectionId: "output_contract",
          purpose: "completion",
          content: "The final response must name artifact marker HFB_DONE.",
        },
      ]),
      { op: "remove", path: "/sections/1" },
    ),
    defineCase(
      "system-prompt",
      2,
      "SystemPrompt",
      "SP_INVERT_TOOL_ORDER",
      promptPayload("primary", [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Solve the deterministic fixture.",
        },
        {
          sectionId: "tool_order",
          purpose: "tool_guidance",
          content: "Inspect with read before using edit.",
        },
      ]),
      {
        op: "replace",
        path: "/sections/1/content",
        value: "Use edit before inspecting with read.",
      },
    ),
    defineCase(
      "system-prompt",
      3,
      "SystemPrompt",
      "SP_OMIT_FAILURE_HANDLING",
      promptPayload("primary", [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Solve the deterministic fixture.",
        },
        {
          sectionId: "failure_handling",
          purpose: "recovery",
          content: "After the scripted error, inspect evidence and retry once.",
        },
      ]),
      { op: "remove", path: "/sections/1" },
    ),
    defineCase(
      "system-prompt",
      4,
      "SystemPrompt",
      "SP_PREMATURE_COMPLETION",
      promptPayload("primary", [
        {
          sectionId: "identity",
          purpose: "identity",
          content: "Solve the deterministic fixture.",
        },
        {
          sectionId: "completion",
          purpose: "completion",
          content: "Complete only after the verifier returns PASS.",
        },
      ]),
      {
        op: "replace",
        path: "/sections/1/content",
        value: "Complete before receiving the verifier outcome.",
      },
    ),
  ];

  const contextPolicy = [
    defineCase(
      "context-policy",
      1,
      "ContextPolicy",
      "CP_EXCLUDE_LATEST_TOOL_RESULT",
      contextPayload(),
      { op: "replace", path: "/sources/1/maxTokens", value: 0 },
    ),
    defineCase(
      "context-policy",
      2,
      "ContextPolicy",
      "CP_TRUNCATE_TASK_REQUIREMENT",
      contextPayload(),
      { op: "replace", path: "/sources/0/maxTokens", value: 8 },
    ),
    defineCase(
      "context-policy",
      3,
      "ContextPolicy",
      "CP_SELECT_STALE_SESSION_EVENT",
      contextPayload([
        {
          source: "task_input",
          priority: 1000,
          maxTokens: 256,
          selection: "all_in_order",
        },
        {
          source: "session_events",
          priority: 900,
          maxTokens: 256,
          selection: "latest_first",
        },
      ]),
      { op: "replace", path: "/sources/1/selection", value: "earliest_first" },
    ),
    defineCase(
      "context-policy",
      4,
      "ContextPolicy",
      "CP_OMIT_TOOL_CATALOG",
      contextPayload([
        {
          source: "task_input",
          priority: 1000,
          maxTokens: 256,
          selection: "all_in_order",
        },
        {
          source: "tool_catalog",
          priority: 900,
          maxTokens: 256,
          selection: "all_in_order",
        },
      ]),
      { op: "remove", path: "/sources/1" },
    ),
  ];

  const memoryPolicy = [
    defineCase(
      "memory-retrieval-policy",
      1,
      "MemoryRetrievalPolicy",
      "MRP_OMIT_PROJECT_FACTS",
      memoryPayload(),
      { op: "remove", path: "/readableNamespaces/0" },
    ),
    defineCase(
      "memory-retrieval-policy",
      2,
      "MemoryRetrievalPolicy",
      "MRP_SCORE_TOO_HIGH",
      memoryPayload(),
      { op: "replace", path: "/minimumScoreMicros", value: 900_000 },
    ),
    defineCase(
      "memory-retrieval-policy",
      3,
      "MemoryRetrievalPolicy",
      "MRP_ZERO_RECORD_LIMIT",
      memoryPayload(),
      { op: "replace", path: "/maxRecords", value: 0 },
    ),
    defineCase(
      "memory-retrieval-policy",
      4,
      "MemoryRetrievalPolicy",
      "MRP_RECENCY_SELECTS_DECOY",
      memoryPayload(),
      { op: "replace", path: "/queryMode", value: "recency" },
    ),
  ];

  const skill = [
    defineCase(
      "skill",
      1,
      "Skill",
      "SK_OMIT_REQUIRED_STEP",
      skillPayload(),
      { op: "remove", path: "/steps/1" },
    ),
    defineCase(
      "skill",
      2,
      "Skill",
      "SK_SWAP_EXISTING_STEPS",
      skillPayload(),
      {
        op: "replace",
        path: "/steps",
        value: [
          {
            stepId: "edit",
            kind: "tool_guidance",
            instruction: "Apply the declared edit after inspection.",
            toolId: "edit",
          },
          {
            stepId: "inspect",
            kind: "tool_guidance",
            instruction: "Inspect the required file before editing.",
            toolId: "read",
          },
          {
            stepId: "evidence",
            kind: "evidence_check",
            instruction: "Inspect the verifier evidence before completion.",
          },
        ],
      },
    ),
    defineCase(
      "skill",
      3,
      "Skill",
      "SK_WRONG_COMPLETION_CHECK",
      skillPayload(),
      {
        op: "replace",
        path: "/completionChecks/0",
        value: "The verifier result must not equal PASS.",
      },
    ),
    defineCase(
      "skill",
      4,
      "Skill",
      "SK_WRONG_EXISTING_TOOL_GUIDANCE",
      skillPayload(),
      { op: "replace", path: "/steps/0/toolId", value: "edit" },
    ),
  ];

  const workflow = [
    defineCase(
      "workflow-policy",
      1,
      "WorkflowPolicy",
      "WF_SKIP_CONTEXT_CONSTRUCTION",
      workflowPayload(),
      { op: "replace", path: "/transitions/0/to", value: "model" },
    ),
    defineCase(
      "workflow-policy",
      2,
      "WorkflowPolicy",
      "WF_TOOL_FAILURE_TO_COMPLETE",
      workflowPayload(),
      { op: "replace", path: "/transitions/1/to", value: "complete" },
    ),
    defineCase(
      "workflow-policy",
      3,
      "WorkflowPolicy",
      "WF_VERIFY_FAILURE_TO_COMPLETE",
      workflowPayload(),
      { op: "replace", path: "/transitions/2/to", value: "complete" },
    ),
    defineCase(
      "workflow-policy",
      4,
      "WorkflowPolicy",
      "WF_JOB_RESULT_WRONG_STATE",
      workflowPayload(),
      { op: "replace", path: "/transitions/3/to", value: "pre_job" },
    ),
  ];

  const routingSubagent = [
    defineCase(
      "routing-subagent",
      1,
      "RoutingPolicy",
      "RT_WRONG_LOW_RULE",
      routingPayload("low"),
      { op: "replace", path: "/rules/0/target/routeId", value: "route.decoy" },
    ),
    defineCase(
      "routing-subagent",
      2,
      "SubagentPrompt",
      "SA_OMIT_ARTIFACT_REQUIREMENT",
      promptPayload("subagent", [
        {
          sectionId: "role",
          purpose: "subagent_role",
          content: "Solve the delegated deterministic task.",
        },
        {
          sectionId: "artifact",
          purpose: "completion",
          content: "Return artifact marker HFB_SUBAGENT_DONE.",
        },
      ]),
      { op: "remove", path: "/sections/1" },
    ),
    defineCase(
      "routing-subagent",
      3,
      "RoutingPolicy",
      "RT_WRONG_HIGH_RULE",
      routingPayload("high"),
      { op: "replace", path: "/rules/0/target/routeId", value: "route.decoy" },
    ),
    defineCase(
      "routing-subagent",
      4,
      "SubagentPrompt",
      "SA_INVERT_SUCCESS_CONDITION",
      promptPayload("subagent", [
        {
          sectionId: "role",
          purpose: "subagent_role",
          content: "Solve the delegated deterministic task.",
        },
        {
          sectionId: "completion",
          purpose: "completion",
          content: "Success requires verifier result PASS.",
        },
      ]),
      {
        op: "replace",
        path: "/sections/1/content",
        value: "Success requires verifier result FAIL.",
      },
    ),
  ];

  const toolDescription = [
    defineCase(
      "tool-description",
      1,
      "ToolDescription",
      "TD_WRONG_READ_PARAMETER_PROSE",
      toolDescriptionPayload(),
      {
        op: "replace",
        path: "/parameterDescriptions/0/description",
        value: "Absolute path of a decoy file to write.",
      },
    ),
    defineCase(
      "tool-description",
      2,
      "ToolDescription",
      "TD_INVERT_EDIT_MODE_PROSE",
      toolDescriptionPayload(),
      {
        op: "replace",
        path: "/usageNotes/0",
        value: "Mode exact appends; mode append replaces the declared match.",
      },
    ),
    defineCase(
      "tool-description",
      3,
      "ToolDescription",
      "TD_WRONG_RESULT_FIELD_PROSE",
      toolDescriptionPayload(),
      {
        op: "replace",
        path: "/usageNotes/1",
        value: "The result field always contains the fixed decoy value EMPTY.",
      },
    ),
    defineCase(
      "tool-description",
      4,
      "ToolDescription",
      "TD_GIT_DIFF_SCOPE_PROSE",
      toolDescriptionPayload(),
      {
        op: "replace",
        path: "/usageNotes/2",
        value: "git_diff reports only the unrelated decoy path scope.",
      },
    ),
  ];

  return [
    ...systemPrompt,
    ...contextPolicy,
    ...memoryPolicy,
    ...skill,
    ...workflow,
    ...routingSubagent,
    ...toolDescription,
  ];
}

const MINE_CASES = mineCaseDefinitions();
const MINE_CASE_BY_ID = new Map(MINE_CASES.map((entry) => [entry.fixtureId, entry]));

export function hfbMineFixtureIds(): readonly string[] {
  return MINE_CASES.map((entry) => entry.fixtureId);
}

export function assertPublicMineFixtureAccess(
  fixtureIdValue: string,
  _principalRole: PrincipalRole,
): void {
  assertCondition(
    MINE_CASE_BY_ID.has(fixtureIdValue),
    "AUTHORIZATION_DENIED",
    "The public builder exposes D_mine bodies only; gate and final bodies require the evaluator vault",
  );
}

function stageAndToolCount(difficulty: HfbDifficulty): {
  readonly stages: number;
  readonly tools: number;
} {
  if (difficulty === "low") return { stages: 2, tools: 1 };
  if (difficulty === "medium") return { stages: 4, tools: 2 };
  return { stages: 6, tools: 3 };
}

function terminalReasonFor(definition: HfbCaseDefinition): string {
  const index = definition.fixtureId.slice(-2);
  return `verification_failed.required_subgoal_${index}`;
}

function traceFor(
  fixture: Pick<
    HfbFixtureDocument,
    "fixtureId" | "taskInput" | "initialState" | "fakeProviderTable" | "fakeToolTable"
  >,
  passed: boolean,
  terminalReason: string,
): readonly HfbTraceEvent[] {
  const events: HfbTraceEvent[] = [];
  const append = (
    eventType: HfbTraceEvent["eventType"],
    payload: JsonValue,
  ): void => {
    events.push({
      sequence: events.length + 1,
      eventType,
      payloadHash: sha256(payload),
    });
  };
  append("fixture_started", {
    fixtureId: fixture.fixtureId,
    taskInputHash: fixture.taskInput.contentHash,
    initialStateHash: fixture.initialState.contentHash,
  });
  for (const row of fixture.fakeProviderTable) {
    append("provider_transition", row as unknown as JsonValue);
    if (row.action.kind === "request_tool") {
      const tool = fixture.fakeToolTable.find(
        (entry) =>
          entry.toolId === row.action.targetId &&
          entry.argumentFixtureId === row.action.argumentFixtureId,
      );
      assertCondition(tool !== undefined, "SCHEMA_INVALID", "Provider row has no fake tool result");
      append("tool_result", {
        toolId: tool.toolId,
        argumentFixtureId: tool.argumentFixtureId,
        status: tool.status,
        resultHash: tool.result.contentHash,
      });
    }
  }
  append("verifier_outcome", { passed, terminalReason });
  append("fixture_completed", { passed });
  return events;
}

function eventChainHash(events: readonly HfbTraceEvent[]): string {
  return sha256(events as unknown as JsonValue);
}

function contentHashForFixture(
  fixture: Omit<HfbFixtureDocument, "contentHash">,
): string {
  return sha256(fixture as unknown as JsonValue);
}

function contentHashForReport(
  report: Omit<HfbCausalValidationReport, "reportHash">,
): string {
  return sha256(report as unknown as JsonValue);
}

export class HarnessFaultBenchMineBuilder {
  readonly #schemas: SchemaRegistry;
  readonly #artifacts: ArtifactStore;
  readonly #registry: HarnessComponentRegistry;

  public constructor(input: {
    schemas: SchemaRegistry;
    artifacts: ArtifactStore;
    registry: HarnessComponentRegistry;
  }) {
    this.#schemas = input.schemas;
    this.#artifacts = input.artifacts;
    this.#registry = input.registry;
  }

  public async buildAll(): Promise<readonly HfbBuiltMineFixture[]> {
    const fixtures: HfbBuiltMineFixture[] = [];
    for (const definition of MINE_CASES) {
      fixtures.push(await this.#build(definition));
    }
    return fixtures;
  }

  public async build(fixtureIdValue: string): Promise<HfbBuiltMineFixture> {
    assertPublicMineFixtureAccess(fixtureIdValue, "benchmark_author");
    return this.#build(MINE_CASE_BY_ID.get(fixtureIdValue)!);
  }

  async #build(definition: HfbCaseDefinition): Promise<HfbBuiltMineFixture> {
    const implementationBytes = Buffer.from(
      `finite-tool-implementation:${definition.fixtureId}`,
      "utf8",
    );
    const implementationArtifact = await this.#artifacts.put(
      implementationBytes,
      "application/octet-stream",
    );
    const toolImplementation = await this.#registry.createComponent({
      componentId: `${definition.fixtureId}.tool-implementation`,
      semanticVersion: "1.0.0",
      typeEntryId: "type.tool-implementation",
      payloadLanguage: "seh.immutable-artifact.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.immutable-artifact.v1",
        kind: "tool_implementation",
        artifact: implementationArtifact,
        entrypoint: "hfb/fake-tool",
        toolchainDigest: sha256({ toolchain: "hfb-finite-table-v1" }),
      } as unknown as JsonValue,
      capabilityIds: ["tool.execute"],
    });
    const permission = await this.#registry.createComponent({
      componentId: `${definition.fixtureId}.permission`,
      semanticVersion: "1.0.0",
      typeEntryId: "type.permission-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.policy-json.v1",
        policyType: "PermissionPolicy",
        policy: {
          network: false,
          allowedToolIds: ["read", "write", "edit", "bash", "git_status", "git_diff"],
        },
      },
      capabilityIds: ["permission.authorize"],
    });
    const safety = await this.#registry.createComponent({
      componentId: `${definition.fixtureId}.safety`,
      semanticVersion: "1.0.0",
      typeEntryId: "type.safety-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.policy-json.v1",
        policyType: "SafetyPolicy",
        policy: {
          network: false,
          dynamicExecution: false,
          secretAccess: false,
        },
      },
      capabilityIds: ["safety.authorize"],
    });
    const budget = await this.#registry.createComponent({
      componentId: `${definition.fixtureId}.budget`,
      semanticVersion: "1.0.0",
      typeEntryId: "type.budget-policy",
      payloadLanguage: "seh.policy-json.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.policy-json.v1",
        policyType: "BudgetPolicy",
        policy: {
          modelCalls: 8,
          tokenLimit: 4096,
          toolCalls: 4,
          wallClockMs: 10000,
        },
      },
      capabilityIds: ["budget.enforce"],
    });
    const modelIdentity = await this.#registry.createComponent({
      componentId: `${definition.fixtureId}.model-identity`,
      semanticVersion: "1.0.0",
      typeEntryId: "type.model-identity",
      payloadLanguage: "seh.policy-json.v1",
      payload: {
        schemaVersion: 1,
        language: "seh.policy-json.v1",
        policyType: "ModelIdentity",
        policy: {
          provider: "finite_table",
          model: "hfb-fake-provider-v1",
        },
      },
      capabilityIds: ["model.invoke.pinned"],
    });

    const goodComponents = new Map<HfbMutableComponentType, ComponentManifest>();
    for (const type of COMPONENT_ORDER) {
      const descriptor = COMPONENT_DESCRIPTORS[type];
      const payload =
        type === definition.componentType
          ? definition.goodPayload
          : genericPayload(type);
      const dependencyManifestIds =
        type === "ToolDescription"
          ? [toolImplementation.componentManifestId]
          : [];
      const component = await this.#registry.createComponent({
        componentId: `${definition.fixtureId}.${descriptor.slotId}`,
        semanticVersion: "1.0.0",
        typeEntryId: descriptor.typeEntryId,
        payloadLanguage: descriptor.payloadLanguage,
        payload,
        capabilityIds: descriptor.capabilityIds,
        dependencyManifestIds,
      });
      goodComponents.set(type, component);
    }

    const targetDescriptor = COMPONENT_DESCRIPTORS[definition.componentType];
    const knownGoodTarget = goodComponents.get(definition.componentType)!;
    const faultyPayload = applyHfbPatch(definition.goodPayload, [definition.patch]);
    const faultyTarget = await this.#registry.createComponent({
      componentId: knownGoodTarget.identity.componentId,
      semanticVersion: "1.0.1",
      typeEntryId: targetDescriptor.typeEntryId,
      payloadLanguage: targetDescriptor.payloadLanguage,
      payload: faultyPayload,
      capabilityIds: targetDescriptor.capabilityIds,
      dependencyManifestIds:
        definition.componentType === "ToolDescription"
          ? [toolImplementation.componentManifestId]
          : [],
    });

    const goodBindings = [
      {
        slotId: "permission",
        componentManifestId: permission.componentManifestId,
      },
      {
        slotId: "safety",
        componentManifestId: safety.componentManifestId,
      },
      {
        slotId: "budget",
        componentManifestId: budget.componentManifestId,
      },
      {
        slotId: "model_identity",
        componentManifestId: modelIdentity.componentManifestId,
      },
      ...COMPONENT_ORDER.map((type) => ({
        slotId: COMPONENT_DESCRIPTORS[type].slotId,
        componentManifestId: goodComponents.get(type)!.componentManifestId,
      })),
    ];
    const faultyBindings = goodBindings.map((binding) => ({
      slotId: binding.slotId,
      componentManifestId:
        binding.componentManifestId === knownGoodTarget.componentManifestId
          ? faultyTarget.componentManifestId
          : binding.componentManifestId,
    }));
    const knownGoodHarness = await this.#registry.createHarness({
      semanticVersion: "1.0.0",
      requiredRuntimeContractHash: HFB_RUNTIME_CONTRACT_HASH,
      bindings: goodBindings,
    });
    const faultyHarness = await this.#registry.createHarness({
      semanticVersion: "1.0.1",
      requiredRuntimeContractHash: HFB_RUNTIME_CONTRACT_HASH,
      bindings: faultyBindings,
    });

    const taskInput = await this.#artifacts.putJson({
      fixtureId: definition.fixtureId,
      objective: "Produce the declared artifact and pass deterministic verification.",
      requiredFacts: ["fact.task_contract", "fact.current_state"],
    });
    const initialState = await this.#artifacts.putJson({
      filesystem: {
        "src/input.txt": "ORIGINAL",
        "src/decoy.txt": "DECOY",
      },
      memory: [
        { recordId: "memory.current", value: "REQUIRED" },
        { recordId: "memory.decoy", value: "STALE" },
      ],
    });
    const { stages, tools } = stageAndToolCount(definition.difficulty);
    const toolIds: HfbToolRow["toolId"][] = ["read", "edit", "git_diff"];
    const fakeToolTable: HfbToolRow[] = [];
    for (let index = 0; index < tools; index += 1) {
      const argumentFixtureId = `args.${String(index + 1).padStart(2, "0")}`;
      const result = await this.#artifacts.putJson({
        fixtureId: definition.fixtureId,
        toolId: toolIds[index]!,
        argumentFixtureId,
        result: `RESULT_${index + 1}`,
      });
      fakeToolTable.push({
        toolId: toolIds[index]!,
        argumentFixtureId,
        status: "ok",
        result,
      });
    }
    const fakeProviderTable: HfbProviderRow[] = [];
    for (let index = 0; index < stages; index += 1) {
      const tool = index < tools ? fakeToolTable[index] : undefined;
      const last = index === stages - 1;
      fakeProviderTable.push({
        state: `state.${String(index).padStart(2, "0")}`,
        requiredContextFactIds:
          index === 0
            ? ["fact.task_contract"]
            : ["fact.current_state", "fact.task_contract"],
        lastToolStatus: index === 0 ? "none" : "ok",
        action: tool
          ? {
              kind: "request_tool",
              targetId: tool.toolId,
              argumentFixtureId: tool.argumentFixtureId,
            }
          : last
            ? {
                kind: "complete",
                targetId: null,
                argumentFixtureId: null,
              }
            : {
                kind: "emit_text",
                targetId: null,
                argumentFixtureId: null,
              },
        nextState: `state.${String(index + 1).padStart(2, "0")}`,
      });
    }

    const traceInput = {
      fixtureId: definition.fixtureId,
      taskInput,
      initialState,
      fakeProviderTable,
      fakeToolTable,
    };
    const faultyTerminalReason = terminalReasonFor(definition);
    const knownGoodTrace = traceFor(traceInput, true, "verification_passed");
    const faultyTrace = traceFor(traceInput, false, faultyTerminalReason);
    const fixtureCore: Omit<HfbFixtureDocument, "contentHash"> = {
      schemaVersion: 1,
      specVersion: HFB_FIXTURE_SPEC_VERSION,
      fixtureId: definition.fixtureId,
      splitRole: "mine",
      difficulty: definition.difficulty,
      knownGoodHarnessVersionId: knownGoodHarness.harnessVersionId,
      faultyHarnessVersionId: faultyHarness.harnessVersionId,
      faults: [
        {
          componentId: knownGoodTarget.identity.componentId,
          componentType: definition.componentType,
          typeEntryId: definition.typeEntryId,
          mechanismCode: definition.mechanismCode,
          patch: [definition.patch],
        },
      ],
      taskInput,
      initialState,
      fakeProviderTable,
      fakeToolTable,
      expected: {
        knownGoodPassed: true,
        faultyPassed: false,
        knownGoodEventChainHash: eventChainHash(knownGoodTrace),
        faultyEventChainHash: eventChainHash(faultyTrace),
        faultyTerminalReason,
      },
      causalInterventions: {
        restoreNonePassed: false,
        restoreEachSingleFaultPassed: [true],
        restoreAllFaultsPassed: true,
        restoreNonGroundTruthComponentPassed: false,
        replayCount: 3,
        replayHashesIdentical: true,
      },
      authorship: {
        authorId: "benchmark-author.synthetic-mine-v1",
        reviewerId: "benchmark-reviewer.synthetic-mine-v1",
        authoredAt: FIXED_AUTHORED_AT,
        reviewedAt: FIXED_REVIEWED_AT,
        authorHadCandidateResultAccess: false,
        reviewerHadCandidateResultAccess: false,
      },
    };
    const document: HfbFixtureDocument = {
      ...fixtureCore,
      contentHash: contentHashForFixture(fixtureCore),
    };
    this.#schemas.validate(
      HFB_FIXTURE_SCHEMA_ID,
      document as unknown as JsonValue,
    );
    const causalReport = await validateHfbSingleFaultFixture({
      fixture: document,
      schemas: this.#schemas,
      artifacts: this.#artifacts,
      registry: this.#registry,
    });
    return {
      document,
      knownGoodTargetManifestId: knownGoodTarget.componentManifestId,
      faultyTargetManifestId: faultyTarget.componentManifestId,
      causalReport,
    };
  }
}

function componentBindingById(
  harness: HarnessVersionManifest,
  componentId: string,
): HarnessVersionManifest["identity"]["componentBindings"][number] {
  const binding = harness.identity.componentBindings.find(
    (entry) => entry.component.componentId === componentId,
  );
  assertCondition(binding !== undefined, "HASH_MISMATCH", "Fixture target is not bound");
  return binding;
}

export async function runHfbFixture(input: {
  fixture: HfbFixtureDocument;
  harnessVersionId: string;
  schemas: SchemaRegistry;
  artifacts: ArtifactStore;
  registry: HarnessComponentRegistry;
}): Promise<HfbExecutionResult> {
  input.schemas.validate(
    HFB_FIXTURE_SCHEMA_ID,
    input.fixture as unknown as JsonValue,
  );
  const { contentHash: _contentHash, ...core } = input.fixture;
  assertCondition(
    input.fixture.contentHash === contentHashForFixture(core),
    "HASH_MISMATCH",
    "HarnessFaultBench fixture content hash mismatch",
  );
  await input.artifacts.verify(input.fixture.taskInput);
  await input.artifacts.verify(input.fixture.initialState);
  for (const tool of input.fixture.fakeToolTable) {
    await input.artifacts.verify(tool.result);
  }
  const active = input.registry.getHarness(input.harnessVersionId);
  const good = input.registry.getHarness(input.fixture.knownGoodHarnessVersionId);
  const faulty = input.registry.getHarness(input.fixture.faultyHarnessVersionId);
  assertCondition(input.fixture.faults.length === 1, "SCHEMA_INVALID", "Expected one mine fault");
  const componentId = input.fixture.faults[0]!.componentId;
  const activeTarget = componentBindingById(active, componentId).component;
  const goodTarget = componentBindingById(good, componentId).component;
  const faultyTarget = componentBindingById(faulty, componentId).component;
  const passed =
    activeTarget.componentManifestId === goodTarget.componentManifestId;
  assertCondition(
    passed ||
      activeTarget.componentManifestId === faultyTarget.componentManifestId,
    "PROTOCOL_MISMATCH",
    "Fixture execution received an unrecognized target component",
  );
  const terminalReason = passed
    ? "verification_passed"
    : input.fixture.expected.faultyTerminalReason;
  const events = traceFor(input.fixture, passed, terminalReason);
  return {
    fixtureId: input.fixture.fixtureId,
    harnessVersionId: input.harnessVersionId,
    passed,
    terminalReason,
    events,
    eventChainHash: eventChainHash(events),
  };
}

export async function validateHfbSingleFaultFixture(input: {
  fixture: HfbFixtureDocument;
  schemas: SchemaRegistry;
  artifacts: ArtifactStore;
  registry: HarnessComponentRegistry;
}): Promise<HfbCausalValidationReport> {
  const fixture = input.fixture;
  const good = input.registry.getHarness(fixture.knownGoodHarnessVersionId);
  const faulty = input.registry.getHarness(fixture.faultyHarnessVersionId);
  const diff = input.registry.diffHarnesses(
    good.harnessVersionId,
    faulty.harnessVersionId,
  );
  assertCondition(
    diff.changed.length === 1 &&
      diff.immutableDiffCount === 0 &&
      diff.disabledConditionalDiffCount === 0,
    "PROTOCOL_MISMATCH",
    "Single-fault fixture must change exactly one enabled mutable component",
  );
  const immutableTrustSlots = [
    "budget",
    "model_identity",
    "permission",
    "safety",
  ];
  for (const slotId of immutableTrustSlots) {
    const goodPin = good.identity.componentBindings.find(
      (binding) => binding.slotId === slotId,
    );
    const faultyPin = faulty.identity.componentBindings.find(
      (binding) => binding.slotId === slotId,
    );
    assertCondition(
      goodPin !== undefined &&
        faultyPin !== undefined &&
        goodPin.component.componentManifestId ===
          faultyPin.component.componentManifestId &&
        input.registry.typeEntry(goodPin.component.typeEntryId).mutableClass ===
          "immutable",
      "PROTOCOL_MISMATCH",
      `Fixture immutable trust pin differs at ${slotId}`,
    );
  }
  assertCondition(
    good.identity.requiredRuntimeContractHash ===
      faulty.identity.requiredRuntimeContractHash,
    "PROTOCOL_MISMATCH",
    "Fixture variants use different runtime contracts",
  );
  const fault = fixture.faults[0]!;
  const changed = diff.changed[0]!;
  assertCondition(
    fault.componentId === changed.before.componentId &&
      fault.componentId === changed.after.componentId &&
      fault.typeEntryId === changed.before.typeEntryId &&
      fault.typeEntryId === changed.after.typeEntryId,
    "PROTOCOL_MISMATCH",
    "Fixture ground truth does not match the harness diff",
  );
  assertCondition(
    canonicalize(
      input.registry.capabilitiesFor(changed.before.componentManifestId),
    ) ===
      canonicalize(
        input.registry.capabilitiesFor(changed.after.componentManifestId),
      ),
    "AUTHORIZATION_DENIED",
    "Fixture mutation changed the component capability set",
  );
  const goodPayload = await input.registry.getPayload(
    changed.before.componentManifestId,
  );
  const faultyPayload = await input.registry.getPayload(
    changed.after.componentManifestId,
  );
  assertCondition(
    canonicalize(applyHfbPatch(goodPayload, fault.patch)) ===
      canonicalize(faultyPayload),
    "HASH_MISMATCH",
    "Declared fixture patch does not reproduce the faulty payload",
  );

  const goodRun = await runHfbFixture({
    ...input,
    harnessVersionId: good.harnessVersionId,
  });
  const faultyRun = await runHfbFixture({
    ...input,
    harnessVersionId: faulty.harnessVersionId,
  });
  assertCondition(
    goodRun.passed &&
      !faultyRun.passed &&
      goodRun.eventChainHash === fixture.expected.knownGoodEventChainHash &&
      faultyRun.eventChainHash === fixture.expected.faultyEventChainHash &&
      faultyRun.terminalReason === fixture.expected.faultyTerminalReason,
    "VERIFICATION_FAILED",
    "Fixture known-good/faulty oracle mismatch",
  );

  const restoredBindings = faulty.identity.componentBindings.map((binding) => ({
    slotId: binding.slotId,
    componentManifestId:
      binding.component.componentId === fault.componentId
        ? changed.before.componentManifestId
        : binding.component.componentManifestId,
  }));
  const restoredHarness = await input.registry.createHarness({
    semanticVersion: "1.0.2+ground-truth-restore",
    requiredRuntimeContractHash: faulty.identity.requiredRuntimeContractHash,
    bindings: restoredBindings,
  });
  const restoredRun = await runHfbFixture({
    ...input,
    harnessVersionId: restoredHarness.harnessVersionId,
  });
  assertCondition(restoredRun.passed, "VERIFICATION_FAILED", "Ground-truth restore did not pass");

  const nonGroundBinding = faulty.identity.componentBindings.find(
    (binding) =>
      binding.component.componentId !== fault.componentId &&
      input.registry.typeEntry(binding.component.typeEntryId).mutableClass ===
        "mutable",
  );
  assertCondition(nonGroundBinding !== undefined, "SCHEMA_INVALID", "No non-ground component");
  const neutralBefore = input.registry.getComponent(
    nonGroundBinding.component.componentManifestId,
  );
  const neutralPayload = await input.registry.getPayload(
    neutralBefore.componentManifestId,
  );
  const neutralAfter = await input.registry.createComponent({
    componentId: neutralBefore.identity.componentId,
    semanticVersion: "1.0.2+neutral-intervention",
    typeEntryId: neutralBefore.identity.typeRegistryRef.typeEntryId,
    payloadLanguage: neutralBefore.identity.payload.language,
    payload: neutralPayload,
    capabilityIds: input.registry.capabilitiesFor(neutralBefore.componentManifestId),
    dependencyManifestIds: input.registry.dependencyIdsFor(
      neutralBefore.componentManifestId,
    ),
  });
  const nonGroundHarness = await input.registry.createHarness({
    semanticVersion: "1.0.2+non-ground-restore",
    requiredRuntimeContractHash: faulty.identity.requiredRuntimeContractHash,
    bindings: faulty.identity.componentBindings.map((binding) => ({
      slotId: binding.slotId,
      componentManifestId:
        binding.component.componentManifestId === neutralBefore.componentManifestId
          ? neutralAfter.componentManifestId
          : binding.component.componentManifestId,
    })),
  });
  const nonGroundRun = await runHfbFixture({
    ...input,
    harnessVersionId: nonGroundHarness.harnessVersionId,
  });
  assertCondition(
    !nonGroundRun.passed,
    "VERIFICATION_FAILED",
    "Non-ground-truth restoration unexpectedly passed",
  );

  const replayHashes = [];
  for (let replay = 0; replay < 3; replay += 1) {
    replayHashes.push(
      (
        await runHfbFixture({
          ...input,
          harnessVersionId: faulty.harnessVersionId,
        })
      ).eventChainHash,
    );
  }
  assertCondition(
    new Set(replayHashes).size === 1,
    "HASH_MISMATCH",
    "Fixture replay hashes differ",
  );
  const reportCore: Omit<HfbCausalValidationReport, "reportHash"> = {
    schemaVersion: 1,
    fixtureId: fixture.fixtureId,
    fixtureContentHash: fixture.contentHash,
    knownGoodPassed: true,
    faultyPassed: false,
    singleChangedComponent: true,
    declaredPatchMatchesPayloads: true,
    groundTruthRestorationPassed: true,
    nonGroundTruthRestorationPassed: false,
    replayCount: 3,
    replayHashesIdentical: true,
    staticRegistryValidationPassed: true,
    immutableTrustPinsIdentical: true,
    capabilitySetUnchanged: true,
  };
  const report: HfbCausalValidationReport = {
    ...reportCore,
    reportHash: contentHashForReport(reportCore),
  };
  input.schemas.validate(
    HFB_CAUSAL_REPORT_SCHEMA_ID,
    report as unknown as JsonValue,
  );
  return report;
}

export interface HfbPrediction {
  readonly fixtureId: string;
  readonly rankedComponentIds: readonly string[];
}

export interface HfbScoreReport {
  readonly schemaVersion: 1;
  readonly scorerVersion: typeof HFB_SCORER_VERSION;
  readonly datasetRole: HfbSplitRole;
  readonly fixtureCommitment: string;
  readonly predictionCommitment: string;
  readonly fixtureCount: number;
  readonly top1Correct: number;
  readonly top3Correct: number;
  readonly top1Micros: number;
  readonly top3Micros: number;
  readonly perFixture: readonly {
    readonly fixtureId: string;
    readonly top1Correct: boolean;
    readonly top3Correct: boolean;
  }[];
  readonly reportHash: string;
}

export function fixtureLabelOracleForScorerSelfTest(
  fixtures: readonly HfbFixtureDocument[],
): readonly HfbPrediction[] {
  assertCondition(
    fixtures.every((fixture) => fixture.splitRole === "mine"),
    "AUTHORIZATION_DENIED",
    "The label oracle is restricted to visible D_mine scorer self-tests",
  );
  return fixtures.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    rankedComponentIds: fixture.faults.map((fault) => fault.componentId),
  }));
}

export function scoreHfbSingleFaultPredictions(input: {
  fixtures: readonly HfbFixtureDocument[];
  predictions: readonly HfbPrediction[];
  registry: HarnessComponentRegistry;
  schemas: SchemaRegistry;
}): HfbScoreReport {
  assertCondition(input.fixtures.length > 0, "SCHEMA_INVALID", "No HFB fixtures");
  for (const fixture of input.fixtures) {
    input.schemas.validate(
      HFB_FIXTURE_SCHEMA_ID,
      fixture as unknown as JsonValue,
    );
    const { contentHash: _contentHash, ...core } = fixture;
    assertCondition(
      fixture.contentHash === contentHashForFixture(core),
      "HASH_MISMATCH",
      "Scorer received a modified fixture",
    );
  }
  const roles = new Set(input.fixtures.map((fixture) => fixture.splitRole));
  assertCondition(roles.size === 1, "SCHEMA_INVALID", "Mixed HFB split roles");
  const fixtureIds = input.fixtures.map((fixture) => fixture.fixtureId);
  assertCondition(
    new Set(fixtureIds).size === fixtureIds.length,
    "SCHEMA_INVALID",
    "Duplicate HFB fixture",
  );
  const predictionById = new Map(
    input.predictions.map((prediction) => [prediction.fixtureId, prediction]),
  );
  assertCondition(
    predictionById.size === input.predictions.length &&
      predictionById.size === input.fixtures.length &&
      input.fixtures.every((fixture) => predictionById.has(fixture.fixtureId)),
    "SCHEMA_INVALID",
    "Predictions must cover the fixture set exactly once",
  );
  const perFixture = input.fixtures.map((fixture) => {
    assertCondition(fixture.faults.length === 1, "SCHEMA_INVALID", "Expected single fault");
    const prediction = predictionById.get(fixture.fixtureId)!;
    assertCondition(
      prediction.rankedComponentIds.length >= 1 &&
        prediction.rankedComponentIds.length <= 8 &&
        new Set(prediction.rankedComponentIds).size ===
          prediction.rankedComponentIds.length,
      "SCHEMA_INVALID",
      "Prediction ranking must contain one to eight distinct component IDs",
    );
    const harness = input.registry.getHarness(fixture.faultyHarnessVersionId);
    const knownIds = new Set(
      harness.identity.componentBindings.map(
        (binding) => binding.component.componentId,
      ),
    );
    assertCondition(
      prediction.rankedComponentIds.every((componentId) =>
        knownIds.has(componentId),
      ),
      "SCHEMA_INVALID",
      "Prediction contains an unknown component ID",
    );
    const groundTruth = fixture.faults[0]!.componentId;
    return {
      fixtureId: fixture.fixtureId,
      top1Correct: prediction.rankedComponentIds[0] === groundTruth,
      top3Correct: prediction.rankedComponentIds.slice(0, 3).includes(groundTruth),
    };
  });
  const top1Correct = perFixture.filter((result) => result.top1Correct).length;
  const top3Correct = perFixture.filter((result) => result.top3Correct).length;
  const reportCore = {
    schemaVersion: 1 as const,
    scorerVersion: HFB_SCORER_VERSION as typeof HFB_SCORER_VERSION,
    datasetRole: [...roles][0]!,
    fixtureCommitment: sha256(
      input.fixtures
        .map((fixture) => ({
          fixtureId: fixture.fixtureId,
          contentHash: fixture.contentHash,
        }))
        .sort((left, right) => left.fixtureId.localeCompare(right.fixtureId)),
    ),
    predictionCommitment: sha256(
      [...input.predictions].sort((left, right) =>
        left.fixtureId.localeCompare(right.fixtureId),
      ),
    ),
    fixtureCount: input.fixtures.length,
    top1Correct,
    top3Correct,
    top1Micros: Math.floor((top1Correct * 1_000_000) / input.fixtures.length),
    top3Micros: Math.floor((top3Correct * 1_000_000) / input.fixtures.length),
    perFixture,
  };
  const report: HfbScoreReport = {
    ...reportCore,
    reportHash: sha256(reportCore as unknown as JsonValue),
  };
  input.schemas.validate(
    HFB_SCORE_REPORT_SCHEMA_ID,
    report as unknown as JsonValue,
  );
  return report;
}

export function hfbMineSuiteCommitment(
  fixtures: readonly HfbBuiltMineFixture[],
): {
  readonly schemaVersion: 1;
  readonly specVersion: typeof HFB_FIXTURE_SPEC_VERSION;
  readonly fixtureCount: number;
  readonly fixtures: readonly {
    readonly fixtureId: string;
    readonly fixtureContentHash: string;
    readonly knownGoodHarnessVersionId: string;
    readonly faultyHarnessVersionId: string;
    readonly causalReportHash: string;
  }[];
  readonly suiteHash: string;
} {
  const entries = fixtures
    .map((fixture) => ({
      fixtureId: fixture.document.fixtureId,
      fixtureContentHash: fixture.document.contentHash,
      knownGoodHarnessVersionId: fixture.document.knownGoodHarnessVersionId,
      faultyHarnessVersionId: fixture.document.faultyHarnessVersionId,
      causalReportHash: fixture.causalReport.reportHash,
    }))
    .sort((left, right) => left.fixtureId.localeCompare(right.fixtureId));
  const core = {
    schemaVersion: 1 as const,
    specVersion: HFB_FIXTURE_SPEC_VERSION as typeof HFB_FIXTURE_SPEC_VERSION,
    fixtureCount: entries.length,
    fixtures: entries,
  };
  return {
    ...core,
    suiteHash: sha256(core as unknown as JsonValue),
  };
}
