import {
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import type {
  Clock,
  IdFactory,
} from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import type { ModelProvider } from "../domain/model.js";
import type {
  AgentRunResult,
  BudgetLimits,
  SessionPins,
} from "../domain/runtime.js";
import type { RuntimeEvent } from "../evidence/runtime-events.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import {
  CanonicalRequestTableProvider,
  type CanonicalRequestObservation,
} from "../providers/canonical-request-table-provider.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import {
  registerBuiltinTools,
} from "../tools/builtins.js";
import type { PrincipalSigner } from "../trust/identity.js";
import { BudgetAccount } from "../runtime/budget.js";
import {
  type ContextPolicy,
  type PromptPayload,
} from "../runtime/context.js";
import { DescendantManager } from "../runtime/descendants.js";
import type {
  MemoryAuthority,
  MemoryNamespace,
  MemoryRetrievalPolicy,
} from "../runtime/memory.js";
import { WorkspacePathGuard } from "../runtime/path-guard.js";
import {
  ClosedRoutingRuntime,
  type DeclarativeRoutingPolicy,
  type RouteSelectionReceipt,
  type RoutingRiskClass,
  type RoutingTaskClass,
} from "../runtime/routing.js";
import { BubblewrapProcessRunner } from "../runtime/sandbox-process.js";
import type { DeclarativeSkill } from "../runtime/skills.js";
import {
  createStandaloneRuntime,
  type StandaloneRuntime,
} from "../runtime/standalone.js";
import type { ToolDescriptionBinding } from "../runtime/tools.js";
import type { TaskVerifier } from "../runtime/verifier.js";
import {
  ClosedWorkflowRuntime,
  type DeclarativeWorkflowPolicy,
  type WorkflowActionHandlers,
  type WorkflowDispatchReceipt,
  type WorkflowGuardFacts,
  type WorkflowTrigger,
} from "../runtime/workflow.js";
import type { SchemaRegistry } from "../contracts/schema-registry.js";

export interface SemanticExecutionEnvironment {
  readonly schemaVersion: 1;
  readonly taskText: string;
  readonly initialFiles: readonly {
    readonly path: string;
    readonly content: string;
  }[];
  readonly initialMemory: readonly {
    readonly namespace: MemoryNamespace;
    readonly content: string;
    readonly authority: MemoryAuthority;
  }[];
  readonly workflowInput: {
    readonly from: string;
    readonly trigger: WorkflowTrigger;
    readonly facts: WorkflowGuardFacts;
  };
  readonly routingInput: {
    readonly taskClass: RoutingTaskClass;
    readonly riskClass: RoutingRiskClass;
  };
}

export interface SemanticHarnessExecutionInput {
  readonly root: string;
  readonly executionId: string;
  readonly protocolId: string;
  readonly selectedHarnessVersionId: string;
  readonly registry: HarnessComponentRegistry;
  readonly schemas: SchemaRegistry;
  readonly provider: ModelProvider;
  readonly verifier: TaskVerifier;
  readonly runtimeSigner: PrincipalSigner;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly environment: SemanticExecutionEnvironment;
}

export interface SemanticHarnessExecutionResult {
  readonly schemaVersion: 1;
  readonly executionId: string;
  readonly selectedHarnessVersionId: string;
  readonly state: AgentRunResult["state"];
  readonly passed: boolean;
  readonly finalTextHash: string | null;
  readonly eventCount: number;
  readonly eventChainHash: string;
  readonly workflowReceipt: WorkflowDispatchReceipt;
  readonly routingReceipt: RouteSelectionReceipt;
  readonly providerObservations: readonly CanonicalRequestObservation[];
  readonly runtimeEvents: readonly RuntimeEvent[];
}

interface PolicyEnvelope {
  readonly schemaVersion: 1;
  readonly language: "seh.policy-json.v1";
  readonly policyType: string;
  readonly policy: Readonly<Record<string, JsonValue>>;
}

interface ToolDescriptionPayload {
  readonly schemaVersion: 1;
  readonly language: "seh.tool-description.v1";
  readonly toolId: string;
  readonly implementationSchemaHash: string;
  readonly summary: string;
  readonly usageNotes: readonly string[];
  readonly parameterDescriptions: readonly {
    readonly jsonPointer: string;
    readonly description: string;
  }[];
}

const MAX_INITIAL_FILE_BYTES = 1024 * 1024;
const DECOY_SUBAGENT_PROMPT: PromptPayload = Object.freeze({
  sections: Object.freeze([
    Object.freeze({
      sectionId: "decoy",
      purpose: "subagent_role" as const,
      content: "Return SEMANTIC_REJECTED without performing the task.",
    }),
  ]),
});

function asObject(
  value: JsonValue,
  label: string,
): Readonly<Record<string, JsonValue>> {
  assertCondition(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value),
    "SCHEMA_INVALID",
    `${label} payload is not an object`,
  );
  return value;
}

function asPolicy(
  value: JsonValue,
  expectedType: string,
): PolicyEnvelope {
  const object = asObject(value, expectedType);
  assertCondition(
    object["schemaVersion"] === 1 &&
      object["language"] === "seh.policy-json.v1" &&
      object["policyType"] === expectedType &&
      typeof object["policy"] === "object" &&
      object["policy"] !== null &&
      !Array.isArray(object["policy"]),
    "SCHEMA_INVALID",
    `${expectedType} policy envelope is malformed`,
  );
  return value as unknown as PolicyEnvelope;
}

function policyInteger(
  policy: Readonly<Record<string, JsonValue>>,
  key: string,
): number {
  const value = policy[key];
  assertCondition(
    Number.isSafeInteger(value) && (value as number) >= 0,
    "SCHEMA_INVALID",
    `Policy ${key} must be a nonnegative safe integer`,
  );
  return value as number;
}

function policyStrings(
  policy: Readonly<Record<string, JsonValue>>,
  key: string,
): readonly string[] {
  const value = policy[key];
  assertCondition(
    Array.isArray(value) &&
      value.every((entry) => typeof entry === "string"),
    "SCHEMA_INVALID",
    `Policy ${key} must be a string array`,
  );
  return value as string[];
}

async function payloadForSlot(
  registry: HarnessComponentRegistry,
  harnessVersionId: string,
  slotId: string,
): Promise<JsonValue> {
  const harness = registry.getHarness(harnessVersionId);
  const binding = harness.identity.componentBindings.find(
    (entry) => entry.slotId === slotId,
  );
  assertCondition(
    binding !== undefined,
    "SCHEMA_INVALID",
    `Harness does not bind runtime slot ${slotId}`,
  );
  return registry.getPayload(
    binding.component.componentManifestId,
  );
}

function promptFrom(value: JsonValue): PromptPayload {
  const object = asObject(value, "Prompt");
  assertCondition(
    object["language"] === "seh.prompt-markdown.v1" &&
      Array.isArray(object["sections"]),
    "SCHEMA_INVALID",
    "Prompt payload is malformed",
  );
  return {
    sections: structuredClone(
      object["sections"],
    ) as unknown as PromptPayload["sections"],
  };
}

function contextFrom(value: JsonValue): ContextPolicy {
  const object = asObject(value, "ContextPolicy");
  assertCondition(
    object["language"] === "seh.context-policy.v1",
    "SCHEMA_INVALID",
    "Context policy language mismatch",
  );
  return {
    totalTokenLimit: object["totalTokenLimit"] as number,
    sources: structuredClone(
      object["sources"],
    ) as unknown as ContextPolicy["sources"],
    overflowPolicy:
      object["overflowPolicy"] as ContextPolicy["overflowPolicy"],
  };
}

function memoryFrom(value: JsonValue): MemoryRetrievalPolicy {
  const object = asObject(value, "MemoryRetrievalPolicy");
  assertCondition(
    object["language"] === "seh.memory-retrieval-policy.v1",
    "SCHEMA_INVALID",
    "Memory retrieval policy language mismatch",
  );
  return {
    readableNamespaces: structuredClone(
      object["readableNamespaces"],
    ) as MemoryRetrievalPolicy["readableNamespaces"],
    queryMode:
      object["queryMode"] as MemoryRetrievalPolicy["queryMode"],
    ...(object["hybridLexicalWeightMicros"] === undefined
      ? {}
      : {
          hybridLexicalWeightMicros:
            object["hybridLexicalWeightMicros"] as number,
        }),
    maxRecords: object["maxRecords"] as number,
    maxTokens: object["maxTokens"] as number,
    minimumScoreMicros:
      object["minimumScoreMicros"] as number,
    tieBreak:
      object["tieBreak"] as MemoryRetrievalPolicy["tieBreak"],
  };
}

function skillFrom(value: JsonValue): DeclarativeSkill {
  const object = asObject(value, "Skill");
  assertCondition(
    object["language"] === "seh.skill.v1",
    "SCHEMA_INVALID",
    "Skill language mismatch",
  );
  return structuredClone(
    value,
  ) as unknown as DeclarativeSkill;
}

function workflowFrom(value: JsonValue): DeclarativeWorkflowPolicy {
  const object = asObject(value, "WorkflowPolicy");
  assertCondition(
    object["language"] === "seh.workflow.v1",
    "SCHEMA_INVALID",
    "Workflow language mismatch",
  );
  return structuredClone(
    value,
  ) as unknown as DeclarativeWorkflowPolicy;
}

function routingFrom(value: JsonValue): DeclarativeRoutingPolicy {
  const object = asObject(value, "RoutingPolicy");
  assertCondition(
    object["language"] === "seh.routing-policy.v1",
    "SCHEMA_INVALID",
    "Routing language mismatch",
  );
  return structuredClone(
    value,
  ) as unknown as DeclarativeRoutingPolicy;
}

function toolDescriptionFrom(
  value: JsonValue,
): ToolDescriptionPayload {
  const object = asObject(value, "ToolDescription");
  assertCondition(
    object["language"] === "seh.tool-description.v1",
    "SCHEMA_INVALID",
    "Tool description language mismatch",
  );
  return structuredClone(
    value,
  ) as unknown as ToolDescriptionPayload;
}

function runtimeToolDescriptions(
  mutableReadDescription: ToolDescriptionPayload,
): readonly ToolDescriptionBinding[] {
  const implementations = registerBuiltinTools(() => undefined);
  return implementations.map((implementation) => {
    if (implementation.toolId !== "filesystem.read") {
      return {
        toolId: implementation.toolId,
        name: implementation.name,
        description:
          `Immutable builtin ${implementation.name} tool.`,
        implementationHash:
          implementation.implementationHash,
        inputSchemaHash: sha256(implementation.inputSchema),
      };
    }
    assertCondition(
      mutableReadDescription.toolId ===
        implementation.toolId &&
        mutableReadDescription.implementationSchemaHash ===
          sha256(implementation.inputSchema),
      "HASH_MISMATCH",
      "Mutable read description is not bound to the immutable read schema",
    );
    const prose = [
      mutableReadDescription.summary,
      ...mutableReadDescription.usageNotes,
      ...mutableReadDescription.parameterDescriptions.map(
        (entry) =>
          `${entry.jsonPointer}: ${entry.description}`,
      ),
    ];
    return {
      toolId: implementation.toolId,
      name: implementation.name,
      description: prose.join("\n"),
      implementationHash: implementation.implementationHash,
      inputSchemaHash: sha256(implementation.inputSchema),
    };
  });
}

function workflowHandlers(): WorkflowActionHandlers {
  const handler = (
    action: keyof WorkflowActionHandlers,
  ): WorkflowActionHandlers[keyof WorkflowActionHandlers] =>
    ({ stateId, targetId }) => ({
      action,
      stateId,
      targetId,
      status: "dispatched",
    });
  return {
    construct_context: handler("construct_context"),
    model_turn: handler("model_turn"),
    retrieve_memory: handler("retrieve_memory"),
    invoke_skill: handler("invoke_skill"),
    request_tool: handler("request_tool"),
    spawn_subagent: handler("spawn_subagent"),
    wait_job: handler("wait_job"),
    verify: handler("verify"),
    emit_completion: handler("emit_completion"),
    emit_block: handler("emit_block"),
  };
}

async function seedWorkspace(
  runtime: StandaloneRuntime,
  files: SemanticExecutionEnvironment["initialFiles"],
): Promise<void> {
  assertCondition(
    new Set(files.map((file) => file.path)).size === files.length,
    "SCHEMA_INVALID",
    "Semantic environment has duplicate initial file paths",
  );
  const workspace = new WorkspacePathGuard(
    runtime.workspaceRoot,
  );
  await workspace.initialize();
  for (const file of files) {
    await workspace.writeFile(
      file.path,
      Buffer.from(file.content, "utf8"),
      {
        overwrite: false,
        maxBytes: MAX_INITIAL_FILE_BYTES,
      },
    );
  }
}

function semanticPins(input: {
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly permissionHash: string;
  readonly safetyHash: string;
  readonly budgetHash: string;
  readonly modelIdentityHash: string;
  readonly environment: SemanticExecutionEnvironment;
}): SessionPins {
  return {
    protocolId: input.protocolId,
    harnessVersionId: input.harnessVersionId,
    runtimeStateSnapshotId: `rss-sha256:${sha256({
      environment: input.environment,
    }).slice("sha256:".length)}`,
    modelIdentityHash: input.modelIdentityHash,
    permissionPolicyHash: input.permissionHash,
    safetyPolicyHash: input.safetyHash,
    budgetPolicyHash: input.budgetHash,
    budgetAccountId: `budget-${sha256({
      harnessVersionId: input.harnessVersionId,
      environment: input.environment,
    }).slice("sha256:".length, 30)}`,
    datasetPermissions: ["deterministic_development"],
  };
}

export async function executeSemanticHarness(
  input: SemanticHarnessExecutionInput,
): Promise<SemanticHarnessExecutionResult> {
  assertCondition(
    input.runtimeSigner.identity.role === "runtime",
    "AUTHORIZATION_DENIED",
    "Semantic execution requires runtime authority",
  );
  assertCondition(
    input.environment.taskText.length > 0,
    "SCHEMA_INVALID",
    "Semantic task text is empty",
  );
  const [
    promptValue,
    contextValue,
    memoryValue,
    skillValue,
    workflowValue,
    routingValue,
    subagentPromptValue,
    toolDescriptionValue,
    permissionValue,
    safetyValue,
    budgetValue,
    modelIdentityValue,
  ] = await Promise.all([
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "system_prompt",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "context_policy",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "memory_retrieval_policy",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "skill",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "workflow_policy",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "routing_policy",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "subagent_prompt",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "tool_description",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "permission",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "safety",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "budget",
    ),
    payloadForSlot(
      input.registry,
      input.selectedHarnessVersionId,
      "model_identity",
    ),
  ]);

  const prompt = promptFrom(promptValue);
  const subagentPrompt = promptFrom(subagentPromptValue);
  const contextPolicy = contextFrom(contextValue);
  const memoryPolicy = memoryFrom(memoryValue);
  const skill = skillFrom(skillValue);
  const workflow = workflowFrom(workflowValue);
  const routing = routingFrom(routingValue);
  const toolDescription =
    toolDescriptionFrom(toolDescriptionValue);
  const permission = asPolicy(
    permissionValue,
    "PermissionPolicy",
  );
  const safety = asPolicy(safetyValue, "SafetyPolicy");
  const budget = asPolicy(budgetValue, "BudgetPolicy");
  const modelIdentity = asPolicy(
    modelIdentityValue,
    "ModelIdentity",
  );
  assertCondition(
    safety.policy["network"] === false &&
      safety.policy["dynamicExecution"] === false &&
      safety.policy["secretAccess"] === false,
    "AUTHORIZATION_DENIED",
    "Semantic fixtures require a closed safety policy",
  );
  const allowedToolIds = policyStrings(
    permission.policy,
    "allowedToolIds",
  );
  const budgetLimits: BudgetLimits = {
    maxModelCalls: policyInteger(
      budget.policy,
      "modelCalls",
    ),
    maxInputTokens: policyInteger(
      budget.policy,
      "inputTokens",
    ),
    maxOutputTokens: policyInteger(
      budget.policy,
      "outputTokens",
    ),
    maxToolCalls: policyInteger(
      budget.policy,
      "toolCalls",
    ),
    maxWallClockMillis: policyInteger(
      budget.policy,
      "wallClockMs",
    ),
    maxRetries: policyInteger(budget.policy, "retries"),
    maxDescendants: policyInteger(
      budget.policy,
      "descendants",
    ),
  };
  const providerName = modelIdentity.policy["provider"];
  const modelName = modelIdentity.policy["model"];
  assertCondition(
    typeof providerName === "string" &&
      typeof modelName === "string" &&
      providerName === input.provider.providerId,
    "PROTOCOL_MISMATCH",
    "Selected model identity does not match provider",
  );
  const resolvedModelIdentity =
    `${providerName}/${modelName}`;
  const toolDescriptions =
    runtimeToolDescriptions(toolDescription);
  const workflowReceipt = await new ClosedWorkflowRuntime(
    workflow,
  ).dispatch({
    ...input.environment.workflowInput,
    handlers: workflowHandlers(),
  });
  const routingReceipt = new ClosedRoutingRuntime(
    routing,
  ).select(input.environment.routingInput);
  const taskForModel = [
    input.environment.taskText,
    [
      `workflow_result to=${workflowReceipt.to}`,
      `actions=${workflowReceipt.dispatchedActions
        .map((entry) => entry.action)
        .join(",")}`,
      `receipt=${workflowReceipt.receiptHash}`,
    ].join(" "),
    [
      `routing_result kind=${routingReceipt.target.kind}`,
      `route=${routingReceipt.target.routeId}`,
      `receipt=${routingReceipt.receiptHash}`,
    ].join(" "),
  ].join("\n");
  const pins = semanticPins({
    protocolId: input.protocolId,
    harnessVersionId: input.selectedHarnessVersionId,
    permissionHash: sha256(permissionValue),
    safetyHash: sha256(safetyValue),
    budgetHash: sha256(budgetValue),
    modelIdentityHash: sha256(modelIdentityValue),
    environment: input.environment,
  });

  let runtime: StandaloneRuntime | null = null;
  let result: AgentRunResult | null = null;
  const createRuntime = async (
    root: string,
    sessionId: string,
    selectedPrompt: PromptPayload,
    selectedBudget: BudgetLimits,
    abortSignal?: AbortSignal,
  ): Promise<AgentRunResult> => {
    const created = await createStandaloneRuntime({
      root,
      schemas: input.schemas,
      provider: input.provider,
      verifier: input.verifier,
      sessionId,
      pins,
      modelIdentity: resolvedModelIdentity,
      runtimeSigner: input.runtimeSigner,
      budgetLimits: selectedBudget,
      clock: input.clock,
      ids: input.ids,
      prompt: selectedPrompt,
      contextPolicy,
      skills: [skill],
      toolDescriptions,
      allowedToolIds,
      memoryPolicy,
      initialMemory: input.environment.initialMemory,
    });
    runtime = created;
    await seedWorkspace(
      created,
      input.environment.initialFiles,
    );
    return created.run(taskForModel, abortSignal);
  };

  if (routingReceipt.target.kind === "primary") {
    assertCondition(
      routingReceipt.target.routeId === "route.primary",
      "AUTHORIZATION_DENIED",
      "Primary route ID is not recognized",
    );
    result = await createRuntime(
      input.root,
      input.executionId,
      prompt,
      budgetLimits,
    );
  } else {
    const selectedPrompt =
      routingReceipt.target.routeId === "route.capable"
        ? subagentPrompt
        : routingReceipt.target.routeId === "route.decoy"
          ? DECOY_SUBAGENT_PROMPT
          : null;
    assertCondition(
      selectedPrompt !== null,
      "AUTHORIZATION_DENIED",
      "Subagent route ID is not recognized",
    );
    const parentWorkspace = new WorkspacePathGuard(
      `${input.root}/parent-workspace`,
    );
    await parentWorkspace.initialize();
    const runner = new BubblewrapProcessRunner(
      parentWorkspace.root,
      {
        timeoutMillis: budgetLimits.maxWallClockMillis,
        maxOutputBytes: 256 * 1024,
        maxCommandBytes: 32 * 1024,
        environment: {},
      },
    );
    await runner.initialize();
    const artifacts = new ArtifactStore(
      `${input.root}/parent-artifacts`,
    );
    await artifacts.initialize();
    const parentBudget = new BudgetAccount(
      budgetLimits,
      input.clock,
    );
    const descendants = new DescendantManager({
      root: `${input.root}/descendant-control`,
      parentSessionId: input.executionId,
      pins,
      parentLimits: budgetLimits,
      permissionCeiling: allowedToolIds,
      parentBudget,
      runner,
      artifacts,
      clock: input.clock,
      ids: input.ids,
    });
    const handle = await descendants.spawnSubagent({
      task: taskForModel,
      budgetSlice: budgetLimits,
      permissionToolIds: allowedToolIds,
      executor: async (
        descendant,
        abortSignal,
      ) => {
        const childResult = await createRuntime(
          `${input.root}/child`,
          descendant.descendantId,
          selectedPrompt,
          descendant.budgetSlice,
          abortSignal,
        );
        result = childResult;
        return childResult;
      },
    });
    const terminal = await descendants.wait(
      handle.descendantId,
    );
    assertCondition(
      terminal.state === "completed" ||
        terminal.state === "failed",
      "INTERNAL_ERROR",
      "Subagent did not reach a terminal state",
    );
  }

  const completedRuntime =
    runtime as StandaloneRuntime | null;
  const completedResult = result as AgentRunResult | null;
  assertCondition(
    completedRuntime !== null && completedResult !== null,
    "INTERNAL_ERROR",
    "Semantic runtime did not produce a result",
  );
  const runtimeEvents =
    await completedRuntime.events.events();
  const typedResult = completedResult;
  return {
    schemaVersion: 1,
    executionId: input.executionId,
    selectedHarnessVersionId:
      input.selectedHarnessVersionId,
    state: typedResult.state,
    passed: typedResult.verification?.passed === true,
    finalTextHash:
      typedResult.finalText === null
        ? null
        : sha256({ text: typedResult.finalText }),
    eventCount: runtimeEvents.length,
    eventChainHash: typedResult.eventHeadHash,
    workflowReceipt,
    routingReceipt,
    providerObservations:
      input.provider instanceof CanonicalRequestTableProvider
        ? structuredClone(input.provider.observations)
        : [],
    runtimeEvents,
  };
}
