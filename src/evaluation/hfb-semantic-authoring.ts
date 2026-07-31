import path from "node:path";

import {
  canonicalize,
  sha256,
  sha256Text,
  type JsonValue,
} from "../core/canonical.js";
import {
  DeterministicClock,
  DeterministicIdFactory,
} from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import type { ComponentManifest } from "../domain/components.js";
import type {
  ModelOutputItem,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelUsage,
} from "../domain/model.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import {
  CanonicalRequestTableProvider,
  canonicalModelRequestProjectionHash,
  type CanonicalRequestTableRow,
} from "../providers/canonical-request-table-provider.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { createReadTool } from "../tools/builtins.js";
import {
  applyHfbPatch,
  hfbMineCasesForSemanticAuthoring,
  type HfbAuthoringCaseDefinition,
  type HfbMutableComponentType,
  type HfbPatchOperation,
} from "./harness-fault-bench.js";
import {
  executeSemanticHarness,
  type SemanticExecutionEnvironment,
  type SemanticHarnessExecutionResult,
} from "./hfb-semantic-execution.js";
import {
  ObservableOutcomeVerifier,
  type ObservableOutcomeContract,
} from "./observable-outcome-verifier.js";
import { createDevelopmentFixturePrincipal } from "./development-fixture-principal.js";

const SEMANTIC_RUNTIME_CONTRACT_HASH = sha256({
  contract: "hfb-semantic-runtime",
  version: "1.0.0",
});
export const HFB_SEMANTIC_SPEC_VERSION =
  "hfb-semantic-development-1.0.0" as const;
const SEMANTIC_PROTOCOL_ID =
  `protocol-sha256:${sha256({
    protocol: "hfb-semantic-development",
    version: "1.0.0",
  }).slice("sha256:".length)}`;
const SEMANTIC_MODEL_IDENTITY =
  "canonical-request-table-fake-v1/hfb-semantic-model-v1";
export const HFB_SEMANTIC_EXECUTION_PACKAGE_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/hfb-semantic-execution-package.schema.json`;
export const HFB_SEMANTIC_ORACLE_RECORD_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/hfb-semantic-oracle-record.schema.json`;
export const HFB_SEMANTIC_VALIDATION_REPORT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/hfb-semantic-validation-report.schema.json`;
export const HFB_SEMANTIC_SUITE_COMMITMENT_SCHEMA_ID =
  `${SCHEMA_BASE_URL}benchmarks/hfb-semantic-suite-commitment.schema.json`;
const ZERO_USAGE: ModelUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  totalTokens: 0,
});

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
      "context.read.memory",
      "context.read.session",
      "context.read.skills",
      "context.read.task",
      "context.read.tool-catalog",
      "context.read.tool-results",
      "context.read.verification",
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
    capabilityIds: [
      "skill.guide",
      "skill.reference.existing-tool",
    ],
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
    capabilityIds: [
      "routing.select.primary",
      "routing.select.subagent",
    ],
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

const COMPONENT_ORDER = Object.freeze([
  "SystemPrompt",
  "ContextPolicy",
  "MemoryRetrievalPolicy",
  "Skill",
  "WorkflowPolicy",
  "RoutingPolicy",
  "SubagentPrompt",
  "ToolDescription",
] as const satisfies readonly HfbMutableComponentType[]);

export interface HfbSemanticOracleRecord {
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly mechanismCode: string;
  readonly targetComponentType: HfbMutableComponentType;
  readonly targetComponentId: string;
  readonly knownGoodHarnessVersionId: string;
  readonly faultyHarnessVersionId: string;
  readonly patch: HfbPatchOperation;
  readonly oracleHash: string;
}

export interface HfbSemanticExecutionPackage {
  readonly schemaVersion: 1;
  readonly protocolId: string;
  readonly environment: SemanticExecutionEnvironment;
  readonly providerRows: readonly CanonicalRequestTableRow[];
  readonly outcomeContract: ObservableOutcomeContract;
  readonly packageHash: string;
}

export interface HfbSemanticValidationReport {
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly knownGoodPassed: true;
  readonly faultyPassed: false;
  readonly exactlyOneHarnessComponentChanged: true;
  readonly immutableDiffCount: 0;
  readonly behaviorDivergedBeforeVerification: true;
  readonly groundTruthRestorationPassed: true;
  readonly nonGroundTruthRestorationPassed: false;
  readonly goodReplayHashes: readonly string[];
  readonly faultyReplayHashes: readonly string[];
  readonly goodReplayHashesIdentical: true;
  readonly faultyReplayHashesIdentical: true;
  readonly reportHash: string;
}

export interface HfbBuiltSemanticFixture {
  readonly oracle: HfbSemanticOracleRecord;
  readonly executionPackage: HfbSemanticExecutionPackage;
  readonly knownGoodResult: SemanticHarnessExecutionResult;
  readonly faultyResult: SemanticHarnessExecutionResult;
  readonly validationReport: HfbSemanticValidationReport;
}

export interface HfbSemanticSuiteCommitment {
  readonly schemaVersion: 1;
  readonly specVersion:
    typeof HFB_SEMANTIC_SPEC_VERSION;
  readonly evidenceClass:
    "deterministic_semantic_development_validation";
  readonly datasetRole: "mine";
  readonly fixtureCount: 28;
  readonly authorityBoundary: {
    readonly oracleSeparatedFromExecution: true;
    readonly executionPackagesContainLabels: false;
    readonly proposerInputRequiresLabelBlindAdapter: true;
    readonly attributionPerformanceClaim: false;
    readonly selfEvolutionClaim: false;
  };
  readonly entries: readonly {
    readonly fixtureId: string;
    readonly oracleHash: string;
    readonly executionPackageHash: string;
    readonly validationReportHash: string;
    readonly knownGoodEventChainHash: string;
    readonly faultyEventChainHash: string;
  }[];
  readonly commitmentHash: string;
}

interface HarnessPair {
  readonly knownGoodHarnessVersionId: string;
  readonly faultyHarnessVersionId: string;
  readonly targetComponentId: string;
}

interface AuthoringPlan {
  readonly outputs: readonly (readonly ModelOutputItem[])[];
  readonly requiresEditedInput: boolean;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

function promptPayload(
  purpose: "primary" | "subagent",
  content: string,
): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.prompt-markdown.v1",
    sections: [
      {
        sectionId:
          purpose === "primary" ? "identity" : "role",
        purpose:
          purpose === "primary"
            ? "identity"
            : "subagent_role",
        content,
      },
    ],
    contextBindings: ["task_input", "tool_catalog"],
  };
}

function fullContextPayload(): JsonValue {
  const sourceNames = [
    "task_input",
    "system_prompt",
    "selected_memory",
    "selected_skills",
    "tool_catalog",
    "tool_results",
    "session_events",
    "verification_feedback",
  ] as const;
  return {
    schemaVersion: 1,
    language: "seh.context-policy.v1",
    totalTokenLimit: 4096,
    sources: sourceNames.map((source, index) => ({
      source,
      priority: 1000 - index * 50,
      maxTokens:
        source === "tool_catalog" ||
        source === "tool_results" ||
        source === "session_events"
          ? 1024
          : 512,
      selection:
        source === "tool_results" ||
        source === "session_events" ||
        source === "verification_feedback"
          ? "latest_first"
          : source === "selected_memory"
            ? "deterministic_rank"
            : "all_in_order",
    })),
    overflowPolicy: "drop_lowest_priority",
  };
}

function memoryPayload(): JsonValue {
  return {
    schemaVersion: 2,
    language: "seh.memory-retrieval-policy.v1",
    readableNamespaces: [
      "project_facts",
      "accepted_lessons",
    ],
    queryMode: "lexical",
    maxRecords: 4,
    maxTokens: 512,
    minimumScoreMicros: 400_000,
    tieBreak: "record_id_ascending",
  };
}

function skillPayload(): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.skill.v1",
    skillId: "hfb.semantic-edit",
    summary:
      "Inspect, edit, and verify the declared artifact.",
    allowedToolIds: [
      "filesystem.edit",
      "filesystem.read",
    ],
    steps: [
      {
        stepId: "inspect",
        kind: "tool_guidance",
        instruction:
          "Inspect the required file before editing.",
        toolId: "filesystem.read",
      },
      {
        stepId: "edit",
        kind: "tool_guidance",
        instruction:
          "Apply the declared edit after inspection.",
        toolId: "filesystem.edit",
      },
      {
        stepId: "evidence",
        kind: "evidence_check",
        instruction:
          "Inspect verifier evidence before completion.",
      },
    ],
    completionChecks: [
      "The verifier result must equal PASS.",
    ],
  };
}

function workflowPayload(): JsonValue {
  const states = [
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
  return {
    schemaVersion: 1,
    language: "seh.workflow.v1",
    entryState: "start",
    states: states.map(([stateId, action]) => ({
      stateId,
      actions: [{ action, targetId: null }],
    })),
    transitions: [
      {
        from: "start",
        trigger: "action_succeeded",
        guard: "always",
        to: "context",
      },
      {
        from: "model",
        trigger: "action_failed",
        guard: "retry_remaining",
        to: "recover",
      },
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

function routingPayload(): JsonValue {
  return {
    schemaVersion: 1,
    language: "seh.routing-policy.v1",
    rules: [
      {
        ruleId: "target_rule",
        priority: 100,
        match: {
          taskClass: "code_change",
          riskClass: "low",
        },
        target: {
          kind: "subagent",
          routeId: "route.capable",
        },
      },
      {
        ruleId: "decoy_rule",
        priority: 10,
        match: {
          taskClass: "unknown",
          riskClass: "low",
        },
        target: {
          kind: "subagent",
          routeId: "route.decoy",
        },
      },
    ],
    defaultTarget: {
      kind: "primary",
      routeId: "route.primary",
    },
  };
}

function toolDescriptionPayload(): JsonValue {
  const read = createReadTool();
  return {
    schemaVersion: 1,
    language: "seh.tool-description.v1",
    toolId: read.toolId,
    implementationSchemaHash: sha256(read.inputSchema),
    summary:
      "Read a declared relative file without changing it.",
    usageNotes: [
      "Inspect before edit; mode exact replaces the declared match.",
      "The result field contains the requested file bytes.",
      "git_diff reports the requested path scope.",
    ],
    parameterDescriptions: [
      {
        jsonPointer: "/path",
        description:
          "Relative path of the file to read.",
      },
    ],
  };
}

function normalizeSemanticGoodPayload(
  componentType: HfbMutableComponentType,
  value: JsonValue,
): JsonValue {
  const payload = cloneJson(value);
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return payload;
  }
  if (componentType === "ToolDescription") {
    const replacement =
      toolDescriptionPayload() as Record<string, JsonValue>;
    payload["toolId"] = replacement["toolId"]!;
    payload["implementationSchemaHash"] =
      replacement["implementationSchemaHash"]!;
  }
  if (componentType === "Skill") {
    payload["allowedToolIds"] = [
      "filesystem.edit",
      "filesystem.read",
    ];
    if (Array.isArray(payload["steps"])) {
      payload["steps"] = payload["steps"].map((step) => {
        if (
          typeof step !== "object" ||
          step === null ||
          Array.isArray(step)
        ) {
          return step;
        }
        const next = { ...step };
        if (next["toolId"] === "read") {
          next["toolId"] = "filesystem.read";
        } else if (next["toolId"] === "edit") {
          next["toolId"] = "filesystem.edit";
        }
        return next;
      });
    }
  }
  return payload;
}

function genericPayload(
  componentType: HfbMutableComponentType,
): JsonValue {
  switch (componentType) {
    case "SystemPrompt":
      return promptPayload(
        "primary",
        "Solve the deterministic semantic task.",
      );
    case "ContextPolicy":
      return fullContextPayload();
    case "MemoryRetrievalPolicy":
      return memoryPayload();
    case "Skill":
      return skillPayload();
    case "WorkflowPolicy":
      return workflowPayload();
    case "RoutingPolicy":
      return routingPayload();
    case "SubagentPrompt":
      return promptPayload(
        "subagent",
        "Solve the delegated semantic task and return evidence.",
      );
    case "ToolDescription":
      return toolDescriptionPayload();
  }
}

function semanticEnvironment(
  definition: HfbAuthoringCaseDefinition,
): SemanticExecutionEnvironment {
  let workflowInput:
    SemanticExecutionEnvironment["workflowInput"] = {
      from: "start",
      trigger: "action_succeeded",
      facts: {
        retryRemaining: true,
        evidenceComplete: true,
      },
    };
  if (definition.mechanismCode === "WF_TOOL_FAILURE_TO_COMPLETE") {
    workflowInput = {
      from: "model",
      trigger: "action_failed",
      facts: {
        retryRemaining: true,
        evidenceComplete: true,
      },
    };
  } else if (
    definition.mechanismCode ===
    "WF_VERIFY_FAILURE_TO_COMPLETE"
  ) {
    workflowInput = {
      from: "verify",
      trigger: "verification_failed",
      facts: {
        retryRemaining: true,
        evidenceComplete: true,
      },
    };
  } else if (
    definition.mechanismCode ===
    "WF_JOB_RESULT_WRONG_STATE"
  ) {
    workflowInput = {
      from: "pre_job",
      trigger: "job_completed",
      facts: {
        retryRemaining: true,
        evidenceComplete: true,
      },
    };
  }

  const routingInput:
    SemanticExecutionEnvironment["routingInput"] =
    definition.componentType === "RoutingPolicy" ||
    definition.componentType === "SubagentPrompt"
      ? {
          taskClass: "code_change",
          riskClass:
            definition.mechanismCode ===
            "RT_WRONG_HIGH_RULE"
              ? "high"
              : "low",
        }
      : {
          taskClass: "analysis",
          riskClass: "low",
        };
  return {
    schemaVersion: 1,
    taskText:
      "alpha beta gamma delta epsilon zeta",
    initialFiles: [
      {
        path: "input.txt",
        content: "ORIGINAL",
      },
    ],
    initialMemory: [
      {
        namespace: "project_facts",
        content: [
          "alpha beta gamma delta epsilon zeta",
          "workflow_result to context actions construct_context receipt",
          "routing_result kind primary route",
        ].join(" "),
        authority: "operator_approved",
      },
      {
        namespace: "project_facts",
        content: "obsolete unrelated quasar decoy",
        authority: "operator_approved",
      },
    ],
    workflowInput,
    routingInput,
  };
}

function toolCall(
  callId: string,
  toolName: string,
  argumentsValue: JsonValue,
): ModelOutputItem {
  return {
    kind: "tool_call",
    callId,
    toolName,
    arguments: argumentsValue,
    rawArguments: canonicalize(argumentsValue),
  };
}

function authoringPlan(
  definition: HfbAuthoringCaseDefinition,
): AuthoringPlan {
  const success: readonly ModelOutputItem[] = [
    {
      kind: "assistant_message",
      text: "SEMANTIC_OK",
    },
  ];
  const read: readonly ModelOutputItem[] = [
    toolCall("call-read", "read", {
      path: "input.txt",
    }),
  ];
  const edit: readonly ModelOutputItem[] = [
    toolCall("call-edit", "edit", {
      path: "input.txt",
      oldText: "ORIGINAL",
      newText: "DONE",
      expectedOccurrences: 1,
    }),
  ];
  if (
    definition.mechanismCode ===
    "CP_SELECT_STALE_SESSION_EVENT"
  ) {
    return {
      outputs: [
        [
          {
            kind: "assistant_message",
            text: `STALE_${"A".repeat(600)}`,
          },
          {
            kind: "assistant_message",
            text: `CURRENT_${"B".repeat(600)}`,
          },
          ...read,
        ],
        success,
      ],
      requiresEditedInput: false,
    };
  }
  if (
    definition.mechanismCode ===
    "SP_OMIT_FAILURE_HANDLING"
  ) {
    return {
      outputs: [
        [
          toolCall("call-missing", "read", {
            path: "missing.txt",
          }),
        ],
        read,
        success,
      ],
      requiresEditedInput: false,
    };
  }
  if (
    definition.componentType === "Skill" ||
    definition.mechanismCode ===
      "SP_INVERT_TOOL_ORDER"
  ) {
    return {
      outputs: [read, edit, success],
      requiresEditedInput: true,
    };
  }
  if (
    definition.componentType === "ToolDescription" ||
    definition.mechanismCode ===
      "CP_EXCLUDE_LATEST_TOOL_RESULT"
  ) {
    return {
      outputs: [read, success],
      requiresEditedInput: false,
    };
  }
  return {
    outputs: [success],
    requiresEditedInput: false,
  };
}

class AuthoringRecordingProvider implements ModelProvider {
  public readonly providerId =
    "canonical-request-table-fake-v1";
  public readonly requests: ModelRequest[] = [];
  public readonly responses: ModelResponse[] = [];
  readonly #outputs: readonly (readonly ModelOutputItem[])[];
  #index = 0;

  public constructor(
    outputs: readonly (readonly ModelOutputItem[])[],
  ) {
    this.#outputs = structuredClone(outputs);
  }

  public async generate(
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const output = this.#outputs[this.#index];
    assertCondition(
      output !== undefined,
      "INTERNAL_ERROR",
      "Benchmark-author provider script is exhausted",
    );
    this.requests.push(request);
    const response: ModelResponse = {
      responseId: `authoring-response-${this.#index}`,
      modelIdentity: request.modelIdentity,
      output: structuredClone(output),
      usage: { ...ZERO_USAGE },
      providerMetadata: {
        authorityDomain: "benchmark_author",
      },
    };
    this.responses.push(response);
    this.#index += 1;
    return response;
  }
}

function authoringRows(
  provider: AuthoringRecordingProvider,
): readonly CanonicalRequestTableRow[] {
  assertCondition(
    provider.requests.length === provider.responses.length,
    "INTERNAL_ERROR",
    "Authoring request and response counts differ",
  );
  const rows = provider.requests.map((request, index) => ({
    requestProjectionHash:
      canonicalModelRequestProjectionHash(request),
    output: provider.responses[index]!.output,
    usage: provider.responses[index]!.usage,
  }));
  assertCondition(
    new Set(
      rows.map((row) => row.requestProjectionHash),
    ).size === rows.length,
    "CONFLICT",
    "Authoring produced ambiguous duplicate request projections",
  );
  return rows;
}

function outcomeContract(
  plan: AuthoringPlan,
): ObservableOutcomeContract {
  return {
    schemaVersion: 1,
    requiredFinalText: "SEMANTIC_OK",
    requiredFiles: plan.requiresEditedInput
      ? [
          {
            path: "input.txt",
            contentHash: sha256Text("DONE"),
          },
        ]
      : [],
  };
}

function oracleRecord(
  definition: HfbAuthoringCaseDefinition,
  pair: HarnessPair,
): HfbSemanticOracleRecord {
  const core = {
    schemaVersion: 1 as const,
    fixtureId: definition.fixtureId,
    mechanismCode: definition.mechanismCode,
    targetComponentType: definition.componentType,
    targetComponentId: pair.targetComponentId,
    knownGoodHarnessVersionId:
      pair.knownGoodHarnessVersionId,
    faultyHarnessVersionId:
      pair.faultyHarnessVersionId,
    patch: cloneJson(
      definition.patch as unknown as JsonValue,
    ) as unknown as HfbPatchOperation,
  };
  return {
    ...core,
    oracleHash: sha256(core as unknown as JsonValue),
  };
}

function packageDocument(input: {
  readonly environment: SemanticExecutionEnvironment;
  readonly providerRows: readonly CanonicalRequestTableRow[];
  readonly outcomeContract: ObservableOutcomeContract;
}): HfbSemanticExecutionPackage {
  const core = {
    schemaVersion: 1 as const,
    protocolId: SEMANTIC_PROTOCOL_ID,
    environment: structuredClone(input.environment),
    providerRows: structuredClone(input.providerRows),
    outcomeContract: structuredClone(input.outcomeContract),
  };
  return {
    ...core,
    packageHash: sha256(core as unknown as JsonValue),
  };
}

function fixedRuntimePrincipal() {
  return createDevelopmentFixturePrincipal({
    principalId: "runtime.hfb-semantic",
    role: "runtime",
    implementationDigest: sha256({
      implementation: "hfb-semantic-runtime",
      version: "1.0.0",
    }),
    instanceId: "hfb-semantic-development",
    seedByte: 91,
  });
}

export function hfbSemanticSuiteCommitment(
  fixtures: readonly HfbBuiltSemanticFixture[],
): HfbSemanticSuiteCommitment {
  assertCondition(
    fixtures.length === 28,
    "SCHEMA_INVALID",
    "Semantic suite commitment requires exactly 28 D_mine fixtures",
  );
  const entries = fixtures
    .map((fixture) => ({
      fixtureId: fixture.oracle.fixtureId,
      oracleHash: fixture.oracle.oracleHash,
      executionPackageHash:
        fixture.executionPackage.packageHash,
      validationReportHash:
        fixture.validationReport.reportHash,
      knownGoodEventChainHash:
        fixture.knownGoodResult.eventChainHash,
      faultyEventChainHash:
        fixture.faultyResult.eventChainHash,
    }))
    .sort((left, right) =>
      left.fixtureId.localeCompare(right.fixtureId),
    );
  assertCondition(
    new Set(entries.map((entry) => entry.fixtureId))
      .size === 28,
    "SCHEMA_INVALID",
    "Semantic suite commitment has duplicate fixture IDs",
  );
  const core = {
    schemaVersion: 1 as const,
    specVersion: HFB_SEMANTIC_SPEC_VERSION,
    evidenceClass:
      "deterministic_semantic_development_validation" as const,
    datasetRole: "mine" as const,
    fixtureCount: 28 as const,
    authorityBoundary: {
      oracleSeparatedFromExecution: true as const,
      executionPackagesContainLabels: false as const,
      proposerInputRequiresLabelBlindAdapter: true as const,
      attributionPerformanceClaim: false as const,
      selfEvolutionClaim: false as const,
    },
    entries,
  };
  return {
    ...core,
    commitmentHash: sha256(
      core as unknown as JsonValue,
    ),
  };
}

export class HarnessFaultBenchSemanticAuthoringBuilder {
  readonly #schemas: SchemaRegistry;
  readonly #artifacts: ArtifactStore;
  readonly #registry: HarnessComponentRegistry;
  readonly #workingRoot: string;

  public constructor(input: {
    readonly schemas: SchemaRegistry;
    readonly artifacts: ArtifactStore;
    readonly registry: HarnessComponentRegistry;
    readonly workingRoot: string;
  }) {
    this.#schemas = input.schemas;
    this.#artifacts = input.artifacts;
    this.#registry = input.registry;
    this.#workingRoot = path.resolve(input.workingRoot);
  }

  public async buildAll():
    Promise<readonly HfbBuiltSemanticFixture[]> {
    const built: HfbBuiltSemanticFixture[] = [];
    for (const definition of
      hfbMineCasesForSemanticAuthoring()) {
      built.push(await this.#build(definition));
    }
    this.#schemas.validate(
      HFB_SEMANTIC_SUITE_COMMITMENT_SCHEMA_ID,
      hfbSemanticSuiteCommitment(
        built,
      ) as unknown as JsonValue,
    );
    return built;
  }

  public async build(
    fixtureId: string,
  ): Promise<HfbBuiltSemanticFixture> {
    const definition =
      hfbMineCasesForSemanticAuthoring().find(
        (entry) => entry.fixtureId === fixtureId,
      );
    assertCondition(
      definition !== undefined,
      "AUTHORIZATION_DENIED",
      "Semantic authoring exposes D_mine definitions only",
    );
    return this.#build(definition);
  }

  async #createHarnessPair(
    definition: HfbAuthoringCaseDefinition,
  ): Promise<HarnessPair> {
    const read = createReadTool();
    const implementationArtifact =
      await this.#artifacts.putJson({
        implementationHash: read.implementationHash,
        inputSchemaHash: sha256(read.inputSchema),
      });
    const toolImplementation =
      await this.#registry.createComponent({
        componentId:
          `${definition.fixtureId}.semantic.tool-implementation`,
        semanticVersion: "1.0.0",
        typeEntryId: "type.tool-implementation",
        payloadLanguage: "seh.immutable-artifact.v1",
        payload: {
          schemaVersion: 1,
          language: "seh.immutable-artifact.v1",
          kind: "tool_implementation",
          artifact: implementationArtifact,
          entrypoint:
            "src/tools/builtins.ts/createReadTool",
          toolchainDigest: sha256({
            toolchain: "typescript-node24",
          }),
        } as unknown as JsonValue,
        capabilityIds: ["tool.execute"],
      });
    const immutableComponents = await Promise.all([
      this.#registry.createComponent({
        componentId:
          `${definition.fixtureId}.semantic.permission`,
        semanticVersion: "1.0.0",
        typeEntryId: "type.permission-policy",
        payloadLanguage: "seh.policy-json.v1",
        payload: {
          schemaVersion: 1,
          language: "seh.policy-json.v1",
          policyType: "PermissionPolicy",
          policy: {
            network: false,
            allowedToolIds: [
              "filesystem.read",
              "filesystem.write",
              "filesystem.edit",
              "shell.bash",
              "git.status",
              "git.diff",
            ],
          },
        },
        capabilityIds: ["permission.authorize"],
      }),
      this.#registry.createComponent({
        componentId:
          `${definition.fixtureId}.semantic.safety`,
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
      }),
      this.#registry.createComponent({
        componentId:
          `${definition.fixtureId}.semantic.budget`,
        semanticVersion: "1.0.0",
        typeEntryId: "type.budget-policy",
        payloadLanguage: "seh.policy-json.v1",
        payload: {
          schemaVersion: 1,
          language: "seh.policy-json.v1",
          policyType: "BudgetPolicy",
          policy: {
            modelCalls: 8,
            inputTokens: 32768,
            outputTokens: 4096,
            toolCalls: 6,
            wallClockMs: 10000,
            retries: 0,
            descendants: 1,
          },
        },
        capabilityIds: ["budget.enforce"],
      }),
      this.#registry.createComponent({
        componentId:
          `${definition.fixtureId}.semantic.model-identity`,
        semanticVersion: "1.0.0",
        typeEntryId: "type.model-identity",
        payloadLanguage: "seh.policy-json.v1",
        payload: {
          schemaVersion: 1,
          language: "seh.policy-json.v1",
          policyType: "ModelIdentity",
          policy: {
            provider:
              "canonical-request-table-fake-v1",
            model: "hfb-semantic-model-v1",
          },
        },
        capabilityIds: ["model.invoke.pinned"],
      }),
    ]);
    const [
      permission,
      safety,
      budget,
      modelIdentity,
    ] = immutableComponents;

    const goodComponents = new Map<
      HfbMutableComponentType,
      ComponentManifest
    >();
    for (const componentType of COMPONENT_ORDER) {
      const descriptor =
        COMPONENT_DESCRIPTORS[componentType];
      const sourcePayload =
        componentType === definition.componentType
          ? definition.goodPayload
          : genericPayload(componentType);
      const payload = normalizeSemanticGoodPayload(
        componentType,
        sourcePayload,
      );
      const component =
        await this.#registry.createComponent({
          componentId:
            `${definition.fixtureId}.semantic.${descriptor.slotId}`,
          semanticVersion: "1.0.0",
          typeEntryId: descriptor.typeEntryId,
          payloadLanguage: descriptor.payloadLanguage,
          payload,
          capabilityIds: descriptor.capabilityIds,
          dependencyManifestIds:
            componentType === "ToolDescription"
              ? [
                  toolImplementation.componentManifestId,
                ]
              : [],
        });
      goodComponents.set(componentType, component);
    }

    const targetDescriptor =
      COMPONENT_DESCRIPTORS[definition.componentType];
    const knownGoodTarget =
      goodComponents.get(definition.componentType)!;
    const goodTargetPayload =
      normalizeSemanticGoodPayload(
        definition.componentType,
        definition.goodPayload,
      );
    const faultyPayload = applyHfbPatch(
      goodTargetPayload,
      [definition.patch],
    );
    const faultyTarget =
      await this.#registry.createComponent({
        componentId:
          knownGoodTarget.identity.componentId,
        semanticVersion: "1.0.1",
        typeEntryId: targetDescriptor.typeEntryId,
        payloadLanguage:
          targetDescriptor.payloadLanguage,
        payload: faultyPayload,
        capabilityIds:
          targetDescriptor.capabilityIds,
        dependencyManifestIds:
          definition.componentType ===
          "ToolDescription"
            ? [toolImplementation.componentManifestId]
            : [],
      });
    const immutableBindings = [
      {
        slotId: "permission",
        componentManifestId:
          permission!.componentManifestId,
      },
      {
        slotId: "safety",
        componentManifestId:
          safety!.componentManifestId,
      },
      {
        slotId: "budget",
        componentManifestId:
          budget!.componentManifestId,
      },
      {
        slotId: "model_identity",
        componentManifestId:
          modelIdentity!.componentManifestId,
      },
    ];
    const goodBindings = [
      ...immutableBindings,
      ...COMPONENT_ORDER.map((componentType) => ({
        slotId:
          COMPONENT_DESCRIPTORS[componentType].slotId,
        componentManifestId:
          goodComponents.get(componentType)!
            .componentManifestId,
      })),
    ];
    const faultyBindings = goodBindings.map(
      (binding) => ({
        ...binding,
        componentManifestId:
          binding.componentManifestId ===
          knownGoodTarget.componentManifestId
            ? faultyTarget.componentManifestId
            : binding.componentManifestId,
      }),
    );
    const knownGoodHarness =
      await this.#registry.createHarness({
        semanticVersion: "1.0.0",
        requiredRuntimeContractHash:
          SEMANTIC_RUNTIME_CONTRACT_HASH,
        bindings: goodBindings,
      });
    const faultyHarness =
      await this.#registry.createHarness({
        semanticVersion: "1.0.1",
        requiredRuntimeContractHash:
          SEMANTIC_RUNTIME_CONTRACT_HASH,
        bindings: faultyBindings,
      });
    const diff = this.#registry.diffHarnesses(
      knownGoodHarness.harnessVersionId,
      faultyHarness.harnessVersionId,
    );
    assertCondition(
      diff.changed.length === 1 &&
        diff.immutableDiffCount === 0 &&
        diff.disabledConditionalDiffCount === 0,
      "SCHEMA_INVALID",
      "Semantic pair must change exactly one mutable component",
    );
    return {
      knownGoodHarnessVersionId:
        knownGoodHarness.harnessVersionId,
      faultyHarnessVersionId:
        faultyHarness.harnessVersionId,
      targetComponentId:
        knownGoodTarget.identity.componentId,
    };
  }

  async #execute(input: {
    readonly root: string;
    readonly executionId: string;
    readonly harnessVersionId: string;
    readonly environment: SemanticExecutionEnvironment;
    readonly provider: ModelProvider;
    readonly verifier: ObservableOutcomeVerifier;
  }): Promise<SemanticHarnessExecutionResult> {
    return executeSemanticHarness({
      root: input.root,
      executionId: input.executionId,
      protocolId: SEMANTIC_PROTOCOL_ID,
      selectedHarnessVersionId:
        input.harnessVersionId,
      registry: this.#registry,
      schemas: this.#schemas,
      provider: input.provider,
      verifier: input.verifier,
      runtimeSigner: fixedRuntimePrincipal(),
      clock: new DeterministicClock(
        "2026-07-31T00:00:00.000Z",
      ),
      ids: new DeterministicIdFactory(),
      environment: input.environment,
    });
  }

  async #build(
    definition: HfbAuthoringCaseDefinition,
  ): Promise<HfbBuiltSemanticFixture> {
    const pair =
      await this.#createHarnessPair(definition);
    const environment =
      semanticEnvironment(definition);
    const plan = authoringPlan(definition);
    const contract = outcomeContract(plan);
    const verifier =
      new ObservableOutcomeVerifier(contract);
    const authoringProvider =
      new AuthoringRecordingProvider(plan.outputs);
    const fixtureRoot = path.join(
      this.#workingRoot,
      definition.fixtureId,
    );
    const authoringResult = await this.#execute({
      root: path.join(fixtureRoot, "authoring"),
      executionId: "semantic-authoring",
      harnessVersionId:
        pair.knownGoodHarnessVersionId,
      environment,
      provider: authoringProvider,
      verifier,
    });
    assertCondition(
      authoringResult.passed,
      "INTERNAL_ERROR",
      "Known-good authoring execution did not pass",
    );
    assertCondition(
      authoringProvider.requests.every(
        (request) =>
          request.modelIdentity ===
          SEMANTIC_MODEL_IDENTITY,
      ),
      "PROTOCOL_MISMATCH",
      "Authoring model identity drifted",
    );
    const providerRows =
      authoringRows(authoringProvider);
    const executionPackage = packageDocument({
      environment,
      providerRows,
      outcomeContract: contract,
    });
    this.#schemas.validate(
      HFB_SEMANTIC_EXECUTION_PACKAGE_SCHEMA_ID,
      executionPackage as unknown as JsonValue,
    );

    const executeTable = async (
      harnessVersionId: string,
      className: "good" | "fault",
      replay: number,
    ): Promise<SemanticHarnessExecutionResult> =>
      this.#execute({
        root: path.join(
          fixtureRoot,
          `${className}-${replay}`,
        ),
        executionId: `semantic-${className}`,
        harnessVersionId,
        environment:
          executionPackage.environment,
        provider:
          new CanonicalRequestTableProvider({
            rows: executionPackage.providerRows,
          }),
        verifier: new ObservableOutcomeVerifier(
          executionPackage.outcomeContract,
        ),
      });
    const goodReplays: SemanticHarnessExecutionResult[] =
      [];
    const faultyReplays:
      SemanticHarnessExecutionResult[] = [];
    for (let replay = 0; replay < 3; replay += 1) {
      goodReplays.push(
        await executeTable(
          pair.knownGoodHarnessVersionId,
          "good",
          replay,
        ),
      );
      faultyReplays.push(
        await executeTable(
          pair.faultyHarnessVersionId,
          "fault",
          replay,
        ),
      );
    }
    const knownGoodResult = goodReplays[0]!;
    const faultyResult = faultyReplays[0]!;
    assertCondition(
      knownGoodResult.passed &&
        !faultyResult.passed,
      "INTERNAL_ERROR",
      `Semantic good/fault outcome contract failed for ${definition.fixtureId}: good=${knownGoodResult.passed} fault=${faultyResult.passed}`,
    );
    const goodHashes = goodReplays.map(
      (entry) => entry.eventChainHash,
    );
    const faultyHashes = faultyReplays.map(
      (entry) => entry.eventChainHash,
    );
    assertCondition(
      new Set(goodHashes).size === 1 &&
        new Set(faultyHashes).size === 1,
      "HASH_MISMATCH",
      "Semantic replay event chains are not deterministic",
    );
    const goodRequests =
      knownGoodResult.providerObservations.map(
        (entry) => entry.requestProjectionHash,
      );
    const faultyRequests =
      faultyResult.providerObservations.map(
        (entry) => entry.requestProjectionHash,
      );
    assertCondition(
      canonicalize(goodRequests) !==
        canonicalize(faultyRequests),
      "INTERNAL_ERROR",
      "Fault did not alter behavior before verification",
    );
    assertCondition(
      knownGoodResult.providerObservations.every(
        (entry) => entry.matched,
      ),
      "INTERNAL_ERROR",
      `Known-good execution left its authored request table for ${definition.fixtureId}`,
    );
    const reportCore = {
      schemaVersion: 1 as const,
      fixtureId: definition.fixtureId,
      knownGoodPassed: true as const,
      faultyPassed: false as const,
      exactlyOneHarnessComponentChanged:
        true as const,
      immutableDiffCount: 0 as const,
      behaviorDivergedBeforeVerification:
        true as const,
      groundTruthRestorationPassed:
        knownGoodResult.passed as true,
      nonGroundTruthRestorationPassed:
        faultyResult.passed as false,
      goodReplayHashes: goodHashes,
      faultyReplayHashes: faultyHashes,
      goodReplayHashesIdentical: true as const,
      faultyReplayHashesIdentical: true as const,
    };
    const validationReport: HfbSemanticValidationReport =
      {
        ...reportCore,
        reportHash: sha256(
          reportCore as unknown as JsonValue,
        ),
      };
    const oracle = oracleRecord(definition, pair);
    this.#schemas.validate(
      HFB_SEMANTIC_ORACLE_RECORD_SCHEMA_ID,
      oracle as unknown as JsonValue,
    );
    this.#schemas.validate(
      HFB_SEMANTIC_VALIDATION_REPORT_SCHEMA_ID,
      validationReport as unknown as JsonValue,
    );
    return {
      oracle,
      executionPackage,
      knownGoodResult,
      faultyResult,
      validationReport,
    };
  }
}
