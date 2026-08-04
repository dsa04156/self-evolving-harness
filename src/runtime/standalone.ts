import path from "node:path";

import { parseStrictJson, sha256, type JsonValue } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { HarnessError, assertCondition } from "../core/errors.js";
import type { SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  AgentRunResult,
  BudgetLimits,
  SessionPins,
} from "../domain/runtime.js";
import {
  RuntimeEventStream,
  SecretRedactor,
  type RuntimeEvent,
} from "../evidence/runtime-events.js";
import type { ModelProvider, ModelReasoningEffort } from "../domain/model.js";
import type { PrincipalSigner } from "../trust/identity.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { registerBuiltinTools } from "../tools/builtins.js";
import { COORDINATION_TOOL_IDS } from "../tools/coordination.js";
import { AgentExecutionLoop } from "./agent-loop.js";
import { BudgetAccount } from "./budget.js";
import { ContextBuilder, type ContextPolicy, type PromptPayload } from "./context.js";
import { DescendantManager } from "./descendants.js";
import {
  FilesystemMemory,
  type MemoryAuthority,
  type MemoryNamespace,
  type MemoryRetrievalPolicy,
} from "./memory.js";
import { WorkspacePathGuard } from "./path-guard.js";
import { BubblewrapProcessRunner } from "./sandbox-process.js";
import type { DeclarativeSkill } from "./skills.js";
import {
  ToolExecutor,
  ToolRegistry,
  type CoordinationToolRuntime,
  type ToolDescriptionBinding,
} from "./tools.js";
import type { TaskVerifier } from "./verifier.js";

export interface StandaloneRuntimeOptions {
  readonly root: string;
  /** Defaults to `<root>/workspace`; product callers may bind an existing repository. */
  readonly workspaceRoot?: string;
  /** Defaults to `<root>/memory`; product callers may share memory across sessions. */
  readonly memoryRoot?: string;
  readonly schemas: SchemaRegistry;
  readonly provider: ModelProvider;
  readonly verifier: TaskVerifier;
  readonly sessionId: string;
  readonly pins: SessionPins;
  readonly modelIdentity: string;
  readonly reasoningEffort?: ModelReasoningEffort;
  readonly runtimeSigner: PrincipalSigner;
  readonly budgetLimits: BudgetLimits;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly prompt: PromptPayload;
  readonly contextPolicy: ContextPolicy;
  readonly skills?: readonly DeclarativeSkill[];
  readonly toolDescriptions?: readonly ToolDescriptionBinding[];
  readonly allowedToolIds?: readonly string[];
  readonly memoryPolicy?: MemoryRetrievalPolicy;
  readonly initialMemory?: readonly {
    readonly namespace: MemoryNamespace;
    readonly content: string;
    readonly authority: MemoryAuthority;
    readonly sourceEventIds?: readonly string[];
  }[];
  readonly secrets?: Readonly<Record<string, string>>;
  readonly onEvent?: (event: RuntimeEvent) => void | Promise<void>;
  readonly processLimits?: {
    readonly timeoutMillis: number;
    readonly maxOutputBytes: number;
    readonly maxCommandBytes: number;
  };
  /** Internal delegation hook: child usage is charged to both accounts. */
  readonly parentBudgetAccount?: BudgetAccount;
}

export interface StandaloneRuntime {
  readonly root: string;
  readonly workspaceRoot: string;
  readonly loop: AgentExecutionLoop;
  readonly events: RuntimeEventStream;
  readonly memory: FilesystemMemory;
  readonly artifacts: ArtifactStore;
  readonly tools: ToolRegistry;
  readonly budget: BudgetAccount;
  readonly descendants: DescendantManager;
  run(task: string, abortSignal?: AbortSignal): Promise<AgentRunResult>;
}

function descendantBudgetSlice(parent: BudgetLimits): BudgetLimits {
  return {
    maxModelCalls: Math.min(parent.maxModelCalls, 8),
    maxInputTokens: Math.min(parent.maxInputTokens, 128_000),
    maxOutputTokens: Math.min(parent.maxOutputTokens, 16_384),
    maxToolCalls: Math.min(parent.maxToolCalls, 24),
    maxWallClockMillis: Math.min(parent.maxWallClockMillis, 10 * 60_000),
    maxRetries: Math.min(parent.maxRetries, 1),
    // The first product release deliberately forbids recursive delegation.
    maxDescendants: 0,
  };
}

function withoutCoordination(toolIds: readonly string[]): readonly string[] {
  const coordinationIds = new Set<string>(COORDINATION_TOOL_IDS);
  return toolIds.filter((toolId) => !coordinationIds.has(toolId));
}

export async function createStandaloneRuntime(
  input: StandaloneRuntimeOptions,
): Promise<StandaloneRuntime> {
  assertCondition(
    input.runtimeSigner.identity.role === "runtime",
    "AUTHORIZATION_DENIED",
    "Standalone runtime requires a runtime principal",
  );
  assertCondition(
    input.pins.protocolId.startsWith("protocol-sha256:") &&
      input.pins.harnessVersionId.startsWith("hv-sha256:") &&
      input.pins.runtimeStateSnapshotId.startsWith("rss-sha256:"),
    "SCHEMA_INVALID",
    "Standalone runtime pins are malformed",
  );
  const root = path.resolve(input.root);
  const workspaceRoot = path.resolve(input.workspaceRoot ?? path.join(root, "workspace"));
  const workspace = new WorkspacePathGuard(workspaceRoot);
  await workspace.initialize();
  const processRunner = new BubblewrapProcessRunner(workspaceRoot, {
    timeoutMillis: input.processLimits?.timeoutMillis ?? 10_000,
    maxOutputBytes: input.processLimits?.maxOutputBytes ?? 256 * 1024,
    maxCommandBytes: input.processLimits?.maxCommandBytes ?? 32 * 1024,
    environment: {},
  });
  await processRunner.initialize();
  const artifacts = new ArtifactStore(path.join(root, "artifacts"));
  await artifacts.initialize();
  const budget = new BudgetAccount(
    input.budgetLimits,
    input.clock,
    input.parentBudgetAccount ?? null,
  );
  const tools = new ToolRegistry();
  const implementations = registerBuiltinTools((tool) => tools.register(tool));
  tools.seal();
  const descriptions =
    input.toolDescriptions ??
    implementations.map((tool) => ({
      toolId: tool.toolId,
      name: tool.name,
      description: `Standalone immutable ${tool.name} tool.`,
      implementationHash: tool.implementationHash,
      inputSchemaHash: sha256(tool.inputSchema),
    }));
  const allowedToolIds =
    input.allowedToolIds ?? implementations.map((tool) => tool.toolId);
  assertCondition(
    allowedToolIds.every((toolId) =>
      implementations.some((implementation) => implementation.toolId === toolId),
    ),
    "TOOL_NOT_FOUND",
    "Permission grant contains an unknown tool ID",
  );
  // Bind descriptions before a model request so a mismatched description,
  // implementation, or input schema fails during construction.
  tools.modelCatalog(descriptions);
  const memory = new FilesystemMemory(
    path.resolve(input.memoryRoot ?? path.join(root, "memory")),
    input.clock,
    input.ids,
  );
  assertCondition(
    (input.initialMemory?.length ?? 0) === 0 ||
      input.memoryPolicy !== undefined,
    "SCHEMA_INVALID",
    "Seeded memory requires an explicit retrieval policy",
  );
  for (const record of input.initialMemory ?? []) {
    await memory.write({
      ...record,
      producerId: input.runtimeSigner.identity.principalId,
    });
  }
  const events = new RuntimeEventStream({
    root: path.join(root, "events"),
    sessionId: input.sessionId,
    pins: input.pins,
    producer: input.runtimeSigner.identity,
    clock: input.clock,
    ids: input.ids,
    schemas: input.schemas,
    redactor: new SecretRedactor(input.secrets ?? {}),
    ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
  });
  const descendants = new DescendantManager({
    root,
    parentSessionId: input.sessionId,
    pins: input.pins,
    parentLimits: input.budgetLimits,
    permissionCeiling: allowedToolIds,
    parentBudget: budget,
    runner: processRunner,
    artifacts,
    clock: input.clock,
    ids: input.ids,
    schemas: input.schemas,
    recordSigner: input.runtimeSigner,
  });
  await descendants.recoverOrphans();

  const observeDescendant = async (
    descendantId: string,
  ): Promise<JsonValue> => {
    const records = await descendants.records(descendantId);
    const latest = records.at(-1);
    if (latest === undefined) {
      throw new HarnessError("ARTIFACT_UNAVAILABLE", `Unknown descendant ${descendantId}`);
    }
    let result: JsonValue = null;
    if (latest.artifactHash !== null) {
      result = parseStrictJson((await artifacts.get(latest.artifactHash)).toString("utf8"));
    }
    return {
      id: latest.descendantId,
      kind: latest.kind,
      state: latest.state,
      taskHash: latest.taskHash,
      artifactHash: latest.artifactHash,
      failureCode: latest.failureCode,
      result,
    };
  };

  const coordination: CoordinationToolRuntime = {
    async spawnAgent(task, abortSignal): Promise<JsonValue> {
      if (abortSignal?.aborted === true) {
        throw new HarnessError("DEADLINE_EXCEEDED", "Subagent authority was revoked");
      }
      const childToolIds = withoutCoordination(allowedToolIds);
      const childDescriptions = descriptions.filter((description) =>
        childToolIds.includes(description.toolId),
      );
      const handle = await descendants.spawnSubagent({
        task,
        budgetSlice: descendantBudgetSlice(input.budgetLimits),
        permissionToolIds: childToolIds,
        executor: async (delegation, childAbortSignal) => {
          const child = await createStandaloneRuntime({
            root: path.join(root, "descendant-runtimes", delegation.descendantId),
            workspaceRoot,
            memoryRoot: path.resolve(input.memoryRoot ?? path.join(root, "memory")),
            schemas: input.schemas,
            provider: input.provider,
            verifier: input.verifier,
            sessionId: delegation.descendantId,
            pins: delegation.pins,
            modelIdentity: input.modelIdentity,
            ...(input.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: input.reasoningEffort }),
            runtimeSigner: input.runtimeSigner,
            budgetLimits: delegation.budgetSlice,
            clock: input.clock,
            ids: input.ids,
            prompt: {
              sections: [
                ...input.prompt.sections,
                {
                  sectionId: "subagent-role",
                  purpose: "subagent_role",
                  content:
                    "You are a bounded child agent. Solve only the delegated task, use the inherited reduced authority, and return concise evidence to the parent. You cannot delegate again.",
                },
              ],
            },
            contextPolicy: input.contextPolicy,
            skills: input.skills ?? [],
            toolDescriptions: childDescriptions,
            allowedToolIds: delegation.permissionToolIds,
            ...(input.memoryPolicy === undefined
              ? {}
              : { memoryPolicy: input.memoryPolicy }),
            secrets: input.secrets ?? {},
            ...(input.onEvent === undefined ? {} : { onEvent: input.onEvent }),
            ...(input.processLimits === undefined
              ? {}
              : { processLimits: input.processLimits }),
            parentBudgetAccount: budget,
          });
          return child.run(delegation.task, childAbortSignal);
        },
      });
      return { id: handle.descendantId, kind: handle.kind, state: handle.state };
    },

    async startJob(command, abortSignal): Promise<JsonValue> {
      if (abortSignal?.aborted === true) {
        throw new HarnessError("DEADLINE_EXCEEDED", "Backend-job authority was revoked");
      }
      const handle = await descendants.startBackendJob({
        command,
        budgetSlice: descendantBudgetSlice(input.budgetLimits),
        permissionToolIds: ["shell.bash"],
      });
      return { id: handle.descendantId, kind: handle.kind, state: handle.state };
    },

    async wait(descendantId, abortSignal): Promise<JsonValue> {
      const onAbort = (): void => {
        void descendants.cancel(descendantId);
      };
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        await descendants.wait(descendantId);
        return observeDescendant(descendantId);
      } finally {
        abortSignal?.removeEventListener("abort", onAbort);
      }
    },

    async list(): Promise<JsonValue> {
      const latest = new Map<string, (Awaited<ReturnType<typeof descendants.records>>)[number]>();
      for (const record of await descendants.records()) latest.set(record.descendantId, record);
      return {
        descendants: [...latest.values()]
          .sort((left, right) => left.descendantId.localeCompare(right.descendantId))
          .map((record) => ({
            id: record.descendantId,
            kind: record.kind,
            state: record.state,
            taskHash: record.taskHash,
            artifactHash: record.artifactHash,
            failureCode: record.failureCode,
          })),
      };
    },

    async cancel(descendantId): Promise<JsonValue> {
      await descendants.cancel(descendantId);
      return observeDescendant(descendantId);
    },
  };

  const executor = new ToolExecutor({
    registry: tools,
    permissions: {
      policyHash: input.pins.permissionPolicyHash,
      allowedToolIds,
    },
    budget,
    artifacts,
    context: { workspace, processRunner, coordination },
    clock: input.clock,
  });
  const loop = new AgentExecutionLoop({
    configuration: {
      sessionId: input.sessionId,
      pins: input.pins,
      modelIdentity: input.modelIdentity,
      ...(input.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: input.reasoningEffort }),
      maxOutputTokensPerCall: Math.min(
        input.budgetLimits.maxOutputTokens,
        4096,
      ),
      workspaceRoot,
      prompt: input.prompt,
      skills: input.skills ?? [],
      toolDescriptions: descriptions,
      ...(input.memoryPolicy === undefined
        ? {}
        : { memory: { store: memory, policy: input.memoryPolicy } }),
    },
    provider: input.provider,
    tools,
    toolExecutor: executor,
    context: new ContextBuilder(input.contextPolicy),
    verifier: input.verifier,
    events,
    budget,
    clock: input.clock,
    ids: input.ids,
    runtimeIdentity: input.runtimeSigner.identity,
  });
  return {
    root,
    workspaceRoot,
    loop,
    events,
    memory,
    artifacts,
    tools,
    budget,
    descendants,
    async run(task, abortSignal) {
      try {
        return await loop.run(task, abortSignal);
      } finally {
        // A parent turn owns its descendants. No live model call or shell
        // process may escape the session/budget lifecycle.
        await descendants.terminateAll();
      }
    },
  };
}
