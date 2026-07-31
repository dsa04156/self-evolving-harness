import path from "node:path";

import {
  canonicalize,
  sha256,
  type JsonValue,
} from "../core/canonical.js";
import {
  DeterministicClock,
  DeterministicIdFactory,
} from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import {
  SCHEMA_BASE_URL,
  type SchemaRegistry,
} from "../contracts/schema-registry.js";
import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../domain/model.js";
import type { HarnessComponentRegistry } from "../harness/component-registry.js";
import {
  verifyNonPromotableHarnessRecord,
  type NonPromotableHarnessRecord,
} from "../governance/non-promotable-harness.js";
import {
  createStandaloneRuntime,
} from "../runtime/standalone.js";
import {
  ClosedWorkflowRuntime,
  type DeclarativeWorkflowPolicy,
  type WorkflowAction,
  type WorkflowActionHandlers,
} from "../runtime/workflow.js";
import {
  FakeTaskVerifier,
} from "../runtime/verifier.js";
import {
  PrincipalRegistry,
  type Attestation,
  type PrincipalIdentity,
  type PrincipalSigner,
  type PublicPrincipal,
} from "../trust/identity.js";

export const DEVELOPMENT_SYNTHETIC_EXECUTION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-synthetic-execution.schema.json`;
export const DEVELOPMENT_SYNTHETIC_EVALUATION_SCHEMA_ID =
  `${SCHEMA_BASE_URL}development-synthetic-evaluation.schema.json`;

const SYNTHETIC_ACTIONS: readonly WorkflowAction[] = [
  "construct_context",
  "model_turn",
  "retrieve_memory",
  "invoke_skill",
  "request_tool",
  "spawn_subagent",
  "wait_job",
  "verify",
  "emit_completion",
  "emit_block",
];

export interface DevelopmentSyntheticTask {
  readonly taskId: string;
  readonly acceptedActions: readonly WorkflowAction[];
}

export interface DevelopmentSyntheticVariantOutcome {
  readonly harnessVersionId: string;
  readonly observedAction: WorkflowAction;
  readonly workflowReceiptHash: string;
  readonly state: "completed" | "blocked" | "terminated";
  readonly passed: boolean;
  readonly finalTextHash: string | null;
  readonly verificationEvidenceHash: string | null;
  readonly eventChainHash: string;
  readonly eventCount: number;
  readonly providerRequestHash: string;
}

export interface DevelopmentSyntheticExecutionBundle {
  readonly schemaVersion: 1;
  readonly executionBundleId: string;
  readonly sourceClass:
    "actual_standalone_runtime_synthetic_execution";
  readonly parentHarnessVersionId: string;
  readonly candidateHarnessVersionId: string;
  readonly changedComponentType: "WorkflowPolicy";
  readonly tasks: readonly {
    readonly taskId: string;
    readonly acceptedActions: readonly WorkflowAction[];
    readonly parent: DevelopmentSyntheticVariantOutcome;
    readonly candidate: DevelopmentSyntheticVariantOutcome;
  }[];
  readonly capabilities: {
    readonly datasetRole: "synthetic_development";
    readonly providerClass:
      "request_observing_deterministic_fake";
    readonly toolClass: "immutable_builtin";
    readonly oracleAccess: false;
    readonly scorerOutputAccess: false;
    readonly gateAccess: false;
    readonly finalAccess: false;
    readonly networkAccess: false;
  };
  readonly developmentOnly: true;
  readonly authorizedForResearchEvidence: false;
  readonly generatedAt: string;
  readonly runtime: PrincipalIdentity;
  readonly bundleHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

export interface DevelopmentSyntheticEvaluationResult {
  readonly schemaVersion: 1;
  readonly resultId: string;
  readonly sourceClass:
    "derived_from_actual_standalone_runtime_evidence";
  readonly executionBundleHash: string;
  readonly candidateHarnessVersionId: string;
  readonly nonPromotableRecordHash: string;
  readonly aggregate: {
    readonly taskCount: number;
    readonly parentPassCount: number;
    readonly candidatePassCount: number;
    readonly passToFailCount: number;
    readonly failToPassCount: number;
    readonly researchMetric: false;
    readonly promotionSignal: false;
  };
  readonly lifecycleBoundary: {
    readonly state: "evaluated_development";
    readonly promotable: false;
    readonly canaryAllowed: false;
    readonly approvedAllowed: false;
    readonly deploymentAllowed: false;
    readonly researchSelectionAllowed: false;
  };
  readonly evaluatedAt: string;
  readonly evaluator: PrincipalIdentity;
  readonly resultHash: string;
  readonly publicPrincipal: PublicPrincipal;
  readonly attestation: Attestation;
}

type ExecutionCore = Omit<
  DevelopmentSyntheticExecutionBundle,
  "bundleHash" | "publicPrincipal" | "attestation"
>;
type ExecutionSignedBody = Omit<
  DevelopmentSyntheticExecutionBundle,
  "attestation"
>;
type EvaluationCore = Omit<
  DevelopmentSyntheticEvaluationResult,
  "resultHash" | "publicPrincipal" | "attestation"
>;
type EvaluationSignedBody = Omit<
  DevelopmentSyntheticEvaluationResult,
  "attestation"
>;

function executionCore(
  value: DevelopmentSyntheticExecutionBundle,
): ExecutionCore {
  const {
    bundleHash: _bundleHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = value;
  return core;
}

function executionSignedBody(
  value: DevelopmentSyntheticExecutionBundle,
): ExecutionSignedBody {
  const { attestation: _attestation, ...body } = value;
  return body;
}

function evaluationCore(
  value: DevelopmentSyntheticEvaluationResult,
): EvaluationCore {
  const {
    resultHash: _resultHash,
    publicPrincipal: _publicPrincipal,
    attestation: _attestation,
    ...core
  } = value;
  return core;
}

function evaluationSignedBody(
  value: DevelopmentSyntheticEvaluationResult,
): EvaluationSignedBody {
  const { attestation: _attestation, ...body } = value;
  return body;
}

function workflowHandlers(): WorkflowActionHandlers {
  const handler = (
    action: WorkflowAction,
  ): WorkflowActionHandlers[WorkflowAction] =>
    ({ stateId, targetId }) => ({
      action,
      stateId,
      targetId,
      source: "development_synthetic_execution",
    });
  return Object.fromEntries(
    SYNTHETIC_ACTIONS.map((action) => [
      action,
      handler(action),
    ]),
  ) as unknown as WorkflowActionHandlers;
}

function asWorkflow(value: JsonValue): DeclarativeWorkflowPolicy {
  assertCondition(
    typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      value["schemaVersion"] === 1 &&
      value["language"] === "seh.workflow.v1",
    "SCHEMA_INVALID",
    "Synthetic runtime received a malformed workflow policy",
  );
  return structuredClone(
    value,
  ) as unknown as DeclarativeWorkflowPolicy;
}

async function workflowFor(
  registry: HarnessComponentRegistry,
  harnessVersionId: string,
): Promise<DeclarativeWorkflowPolicy> {
  const harness = registry.getHarness(harnessVersionId);
  const binding = harness.identity.componentBindings.find(
    (entry) => entry.slotId === "workflow",
  );
  assertCondition(
    binding !== undefined,
    "SCHEMA_INVALID",
    "Synthetic harness does not bind workflow",
  );
  return asWorkflow(
    await registry.getPayload(
      binding.component.componentManifestId,
    ),
  );
}

interface ProviderObservation {
  readonly requestHash: string;
  readonly observedAction: WorkflowAction;
}

class RequestObservingSyntheticProvider
  implements ModelProvider {
  public readonly providerId =
    "development-request-observing-fake-v1";
  public readonly observations: ProviderObservation[] = [];

  public async generate(
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const content = request.input
      .filter(
        (entry) =>
          entry.kind === "text" && entry.role === "user",
      )
      .map((entry) =>
        entry.kind === "text" ? entry.content : "",
      )
      .join("\n");
    const matches = [
      ...content.matchAll(
        /SYNTHETIC_WORKFLOW_OBSERVATION action=([a-z_]+)/gu,
      ),
    ];
    assertCondition(
      matches.length === 1 &&
        SYNTHETIC_ACTIONS.includes(
          matches[0]![1] as WorkflowAction,
        ),
      "SCHEMA_INVALID",
      "Synthetic provider could not derive one workflow action from the actual request",
    );
    const observedAction = matches[0]![1] as WorkflowAction;
    const requestHash = sha256({
      modelIdentity: request.modelIdentity,
      instructions: request.instructions,
      input: request.input,
      tools: request.tools,
      maxOutputTokens: request.maxOutputTokens,
      reasoningEffort: request.reasoningEffort ?? null,
    } as unknown as JsonValue);
    this.observations.push({
      requestHash,
      observedAction,
    });
    return {
      responseId:
        `synthetic-response-${requestHash.slice("sha256:".length, 18)}`,
      modelIdentity: request.modelIdentity,
      output: [
        {
          kind: "assistant_message",
          text:
            `OBSERVED_WORKFLOW_ACTION:${observedAction}`,
        },
      ],
      usage: {
        inputTokens: 16,
        outputTokens: 4,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 20,
      },
      providerMetadata: {
        providerKind:
          "request_observing_deterministic_fake",
        requestHash,
      },
    };
  }
}

async function runVariant(input: {
  readonly root: string;
  readonly protocolId: string;
  readonly harnessVersionId: string;
  readonly task: DevelopmentSyntheticTask;
  readonly workflow: DeclarativeWorkflowPolicy;
  readonly runtimeSigner: PrincipalSigner;
  readonly schemas: SchemaRegistry;
}): Promise<DevelopmentSyntheticVariantOutcome> {
  const receipt = await new ClosedWorkflowRuntime(
    input.workflow,
  ).dispatch({
    from: input.workflow.entryState,
    trigger: "action_succeeded",
    facts: {
      retryRemaining: false,
      evidenceComplete: true,
    },
    handlers: workflowHandlers(),
  });
  assertCondition(
    receipt.dispatchedActions.length === 1,
    "SCHEMA_INVALID",
    "Synthetic workflow must dispatch exactly one observable action",
  );
  const observedAction =
    receipt.dispatchedActions[0]!.action;
  const provider = new RequestObservingSyntheticProvider();
  const expectedText =
    `OBSERVED_WORKFLOW_ACTION:${observedAction}`;
  const verifier = new FakeTaskVerifier(
    sha256({
      verifier:
        "development-observed-workflow-action-v1",
      taskId: input.task.taskId,
      acceptedActions: input.task.acceptedActions,
    }),
    ({ proposedAnswer }) => {
      const passed =
        proposedAnswer === expectedText &&
        input.task.acceptedActions.includes(observedAction);
      return {
        passed,
        summary: passed
          ? "Synthetic observed workflow action accepted"
          : "Synthetic observed workflow action rejected",
        evidence: {
          taskId: input.task.taskId,
          observedAction,
          answerMatched: proposedAnswer === expectedText,
          actionAccepted:
            input.task.acceptedActions.includes(
              observedAction,
            ),
        },
        retryable: false,
      };
    },
  );
  const clock = new DeterministicClock(
    "2026-07-31T10:00:00.000Z",
  );
  const ids = new DeterministicIdFactory(0);
  const runtime = await createStandaloneRuntime({
    root: input.root,
    schemas: input.schemas,
    provider,
    verifier,
    sessionId:
      `synthetic.${input.task.taskId}.${input.harnessVersionId.slice(-12)}`,
    pins: {
      protocolId: input.protocolId,
      harnessVersionId: input.harnessVersionId,
      runtimeStateSnapshotId:
        `rss-sha256:${sha256({
          taskId: input.task.taskId,
          harnessVersionId: input.harnessVersionId,
          workflowReceiptHash: receipt.receiptHash,
        }).slice("sha256:".length)}`,
      modelIdentityHash: sha256({
        provider:
          "development-request-observing-fake-v1",
        model: "synthetic-workflow-observer-v1",
      }),
      permissionPolicyHash: sha256({
        allowedToolIds: [],
      }),
      safetyPolicyHash: sha256({
        network: false,
        dynamicExecution: false,
        secretAccess: false,
      }),
      budgetPolicyHash: sha256({
        modelCalls: 1,
        toolCalls: 0,
      }),
      budgetAccountId:
        `budget.synthetic.${input.task.taskId}.${input.harnessVersionId.slice(-8)}`,
      datasetPermissions: ["synthetic_development"],
    },
    modelIdentity:
      "development-request-observing-fake-v1/synthetic-workflow-observer-v1",
    runtimeSigner: input.runtimeSigner,
    budgetLimits: {
      maxModelCalls: 1,
      maxInputTokens: 4096,
      maxOutputTokens: 256,
      maxToolCalls: 0,
      maxWallClockMillis: 30_000,
      maxRetries: 0,
      maxDescendants: 0,
    },
    clock,
    ids,
    prompt: {
      sections: [
        {
          sectionId: "identity",
          purpose: "identity",
          content:
            "Report the single synthetic workflow observation exactly.",
        },
      ],
    },
    contextPolicy: {
      totalTokenLimit: 2048,
      sources: [
        {
          source: "system_prompt",
          priority: 100,
          maxTokens: 512,
          selection: "all_in_order",
        },
        {
          source: "task_input",
          priority: 90,
          maxTokens: 1024,
          selection: "all_in_order",
        },
        {
          source: "tool_catalog",
          priority: 80,
          maxTokens: 128,
          selection: "all_in_order",
        },
      ],
      overflowPolicy: "block",
    },
    allowedToolIds: [],
  });
  const result = await runtime.run(
    [
      `Synthetic non-benchmark task ${input.task.taskId}.`,
      `SYNTHETIC_WORKFLOW_OBSERVATION action=${observedAction}`,
      `workflowReceipt=${receipt.receiptHash}`,
    ].join("\n"),
  );
  assertCondition(
    provider.observations.length === 1,
    "INTERNAL_ERROR",
    "Synthetic provider did not observe exactly one model request",
  );
  return {
    harnessVersionId: input.harnessVersionId,
    observedAction,
    workflowReceiptHash: receipt.receiptHash,
    state: result.state,
    passed: result.verification?.passed === true,
    finalTextHash:
      result.finalText === null
        ? null
        : sha256({ text: result.finalText }),
    verificationEvidenceHash:
      result.verification === null
        ? null
        : sha256(
            result.verification.evidence,
          ),
    eventChainHash: result.eventHeadHash,
    eventCount: result.eventCount,
    providerRequestHash:
      provider.observations[0]!.requestHash,
  };
}

export async function executeDevelopmentSyntheticRuntime(
  input: {
    readonly root: string;
    readonly protocolId: string;
    readonly executionBundleId: string;
    readonly parentHarnessVersionId: string;
    readonly candidateHarnessVersionId: string;
    readonly tasks: readonly DevelopmentSyntheticTask[];
    readonly registry: HarnessComponentRegistry;
    readonly runtimeSigner: PrincipalSigner;
    readonly schemas: SchemaRegistry;
    readonly generatedAt: string;
  },
): Promise<DevelopmentSyntheticExecutionBundle> {
  assertCondition(
    input.runtimeSigner.identity.role === "runtime",
    "AUTHORIZATION_DENIED",
    "Actual synthetic execution requires runtime authority",
  );
  assertCondition(
    input.tasks.length > 0 &&
      new Set(input.tasks.map((task) => task.taskId))
        .size === input.tasks.length &&
      input.tasks.every(
        (task) =>
          task.acceptedActions.length > 0 &&
          new Set(task.acceptedActions).size ===
            task.acceptedActions.length,
      ),
    "SCHEMA_INVALID",
    "Synthetic execution tasks must be nonempty and unique",
  );
  const diff = input.registry.diffHarnesses(
    input.parentHarnessVersionId,
    input.candidateHarnessVersionId,
  );
  assertCondition(
    diff.changed.length === 1 &&
      diff.changed[0]!.mutableClass === "mutable" &&
      diff.changed[0]!.mvpMutationEnabled &&
      input.registry.typeEntry(
        diff.changed[0]!.before.typeEntryId,
      ).componentType === "WorkflowPolicy" &&
      diff.immutableDiffCount === 0 &&
      diff.disabledConditionalDiffCount === 0,
    "AUTHORIZATION_DENIED",
    "Actual synthetic execution requires one bounded WorkflowPolicy candidate",
  );
  const [parentWorkflow, candidateWorkflow] =
    await Promise.all([
      workflowFor(
        input.registry,
        input.parentHarnessVersionId,
      ),
      workflowFor(
        input.registry,
        input.candidateHarnessVersionId,
      ),
    ]);
  const tasks = [];
  for (const task of input.tasks) {
    const taskRoot = path.join(
      path.resolve(input.root),
      task.taskId,
    );
    tasks.push({
      taskId: task.taskId,
      acceptedActions: [...task.acceptedActions],
      parent: await runVariant({
        root: path.join(taskRoot, "parent"),
        protocolId: input.protocolId,
        harnessVersionId:
          input.parentHarnessVersionId,
        task,
        workflow: parentWorkflow,
        runtimeSigner: input.runtimeSigner,
        schemas: input.schemas,
      }),
      candidate: await runVariant({
        root: path.join(taskRoot, "candidate"),
        protocolId: input.protocolId,
        harnessVersionId:
          input.candidateHarnessVersionId,
        task,
        workflow: candidateWorkflow,
        runtimeSigner: input.runtimeSigner,
        schemas: input.schemas,
      }),
    });
  }
  const core: ExecutionCore = {
    schemaVersion: 1,
    executionBundleId: input.executionBundleId,
    sourceClass:
      "actual_standalone_runtime_synthetic_execution",
    parentHarnessVersionId:
      input.parentHarnessVersionId,
    candidateHarnessVersionId:
      input.candidateHarnessVersionId,
    changedComponentType: "WorkflowPolicy",
    tasks,
    capabilities: {
      datasetRole: "synthetic_development",
      providerClass:
        "request_observing_deterministic_fake",
      toolClass: "immutable_builtin",
      oracleAccess: false,
      scorerOutputAccess: false,
      gateAccess: false,
      finalAccess: false,
      networkAccess: false,
    },
    developmentOnly: true,
    authorizedForResearchEvidence: false,
    generatedAt: input.generatedAt,
    runtime: input.runtimeSigner.identity,
  };
  const publicPrincipal =
    input.runtimeSigner.exportPublic();
  const body: ExecutionSignedBody = {
    ...core,
    bundleHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const bundle: DevelopmentSyntheticExecutionBundle = {
    ...body,
    attestation: input.runtimeSigner.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentSyntheticExecution({
    bundle,
    schemas: input.schemas,
  });
  return bundle;
}

export function verifyDevelopmentSyntheticExecution(input: {
  readonly bundle: DevelopmentSyntheticExecutionBundle;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_SYNTHETIC_EXECUTION_SCHEMA_ID,
    input.bundle as unknown as JsonValue,
  );
  assertCondition(
    input.bundle.runtime.role === "runtime" &&
      canonicalize(input.bundle.publicPrincipal.identity) ===
        canonicalize(input.bundle.runtime),
    "AUTHORIZATION_DENIED",
    "Synthetic execution bundle is not signed by runtime",
  );
  assertCondition(
    input.bundle.tasks.every(
      (task) =>
        task.parent.harnessVersionId ===
          input.bundle.parentHarnessVersionId &&
        task.candidate.harnessVersionId ===
          input.bundle.candidateHarnessVersionId,
    ) &&
      input.bundle.bundleHash ===
        sha256(
          executionCore(
            input.bundle,
          ) as unknown as JsonValue,
        ),
    "HASH_MISMATCH",
    "Synthetic execution bundle binding mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.bundle.publicPrincipal);
  principals.verify(
    input.bundle.runtime,
    executionSignedBody(
      input.bundle,
    ) as unknown as JsonValue,
    input.bundle.attestation,
  );
}

export function createDevelopmentSyntheticEvaluation(
  input: {
    readonly resultId: string;
    readonly execution: DevelopmentSyntheticExecutionBundle;
    readonly nonPromotableRecord: NonPromotableHarnessRecord;
    readonly evaluatedAt: string;
    readonly signer: PrincipalSigner;
    readonly schemas: SchemaRegistry;
  },
): DevelopmentSyntheticEvaluationResult {
  assertCondition(
    input.signer.identity.role === "evaluator",
    "AUTHORIZATION_DENIED",
    "Synthetic candidate evaluation requires evaluator authority",
  );
  verifyDevelopmentSyntheticExecution({
    bundle: input.execution,
    schemas: input.schemas,
  });
  verifyNonPromotableHarnessRecord({
    record: input.nonPromotableRecord,
    schemas: input.schemas,
  });
  assertCondition(
    input.nonPromotableRecord.harnessVersionId ===
      input.execution.candidateHarnessVersionId,
    "HASH_MISMATCH",
    "Synthetic evaluation candidate is not the quarantined candidate",
  );
  let parentPassCount = 0;
  let candidatePassCount = 0;
  let passToFailCount = 0;
  let failToPassCount = 0;
  for (const task of input.execution.tasks) {
    if (task.parent.passed) parentPassCount += 1;
    if (task.candidate.passed) candidatePassCount += 1;
    if (task.parent.passed && !task.candidate.passed) {
      passToFailCount += 1;
    }
    if (!task.parent.passed && task.candidate.passed) {
      failToPassCount += 1;
    }
  }
  const core: EvaluationCore = {
    schemaVersion: 1,
    resultId: input.resultId,
    sourceClass:
      "derived_from_actual_standalone_runtime_evidence",
    executionBundleHash: input.execution.bundleHash,
    candidateHarnessVersionId:
      input.execution.candidateHarnessVersionId,
    nonPromotableRecordHash:
      input.nonPromotableRecord.recordHash,
    aggregate: {
      taskCount: input.execution.tasks.length,
      parentPassCount,
      candidatePassCount,
      passToFailCount,
      failToPassCount,
      researchMetric: false,
      promotionSignal: false,
    },
    lifecycleBoundary: {
      state: "evaluated_development",
      promotable: false,
      canaryAllowed: false,
      approvedAllowed: false,
      deploymentAllowed: false,
      researchSelectionAllowed: false,
    },
    evaluatedAt: input.evaluatedAt,
    evaluator: input.signer.identity,
  };
  const publicPrincipal = input.signer.exportPublic();
  const body: EvaluationSignedBody = {
    ...core,
    resultHash: sha256(core as unknown as JsonValue),
    publicPrincipal,
  };
  const result: DevelopmentSyntheticEvaluationResult = {
    ...body,
    attestation: input.signer.attest(
      body as unknown as JsonValue,
    ),
  };
  verifyDevelopmentSyntheticEvaluation({
    result,
    execution: input.execution,
    nonPromotableRecord: input.nonPromotableRecord,
    schemas: input.schemas,
  });
  return result;
}

export function verifyDevelopmentSyntheticEvaluation(input: {
  readonly result: DevelopmentSyntheticEvaluationResult;
  readonly execution: DevelopmentSyntheticExecutionBundle;
  readonly nonPromotableRecord: NonPromotableHarnessRecord;
  readonly schemas: SchemaRegistry;
}): void {
  input.schemas.validate(
    DEVELOPMENT_SYNTHETIC_EVALUATION_SCHEMA_ID,
    input.result as unknown as JsonValue,
  );
  verifyDevelopmentSyntheticExecution({
    bundle: input.execution,
    schemas: input.schemas,
  });
  verifyNonPromotableHarnessRecord({
    record: input.nonPromotableRecord,
    schemas: input.schemas,
  });
  assertCondition(
    input.result.executionBundleHash ===
      input.execution.bundleHash &&
      input.result.candidateHarnessVersionId ===
        input.execution.candidateHarnessVersionId &&
      input.result.nonPromotableRecordHash ===
        input.nonPromotableRecord.recordHash &&
      input.result.evaluator.role === "evaluator" &&
      canonicalize(input.result.publicPrincipal.identity) ===
        canonicalize(input.result.evaluator),
    "HASH_MISMATCH",
    "Synthetic evaluation binding mismatch",
  );
  assertCondition(
    input.result.resultHash ===
      sha256(
        evaluationCore(
          input.result,
        ) as unknown as JsonValue,
      ),
    "HASH_MISMATCH",
    "Synthetic evaluation result hash mismatch",
  );
  const principals = new PrincipalRegistry();
  principals.register(input.result.publicPrincipal);
  principals.verify(
    input.result.evaluator,
    evaluationSignedBody(
      input.result,
    ) as unknown as JsonValue,
    input.result.attestation,
  );
}
