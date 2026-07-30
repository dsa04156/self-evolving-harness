import path from "node:path";

import { sha256 } from "../core/canonical.js";
import type { Clock, IdFactory } from "../core/determinism.js";
import { assertCondition } from "../core/errors.js";
import type { SchemaRegistry } from "../contracts/schema-registry.js";
import type {
  AgentRunResult,
  BudgetLimits,
  SessionPins,
} from "../domain/runtime.js";
import { RuntimeEventStream, SecretRedactor } from "../evidence/runtime-events.js";
import type { ModelProvider } from "../domain/model.js";
import type { PrincipalSigner } from "../trust/identity.js";
import { ArtifactStore } from "../storage/artifact-store.js";
import { registerBuiltinTools } from "../tools/builtins.js";
import { AgentExecutionLoop } from "./agent-loop.js";
import { BudgetAccount } from "./budget.js";
import { ContextBuilder, type ContextPolicy, type PromptPayload } from "./context.js";
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
  type ToolDescriptionBinding,
} from "./tools.js";
import type { TaskVerifier } from "./verifier.js";

export interface StandaloneRuntimeOptions {
  readonly root: string;
  readonly schemas: SchemaRegistry;
  readonly provider: ModelProvider;
  readonly verifier: TaskVerifier;
  readonly sessionId: string;
  readonly pins: SessionPins;
  readonly modelIdentity: string;
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
  readonly processLimits?: {
    readonly timeoutMillis: number;
    readonly maxOutputBytes: number;
    readonly maxCommandBytes: number;
  };
}

export interface StandaloneRuntime {
  readonly root: string;
  readonly workspaceRoot: string;
  readonly loop: AgentExecutionLoop;
  readonly events: RuntimeEventStream;
  readonly memory: FilesystemMemory;
  readonly artifacts: ArtifactStore;
  readonly tools: ToolRegistry;
  run(task: string, abortSignal?: AbortSignal): Promise<AgentRunResult>;
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
  const workspaceRoot = path.join(root, "workspace");
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
  const budget = new BudgetAccount(input.budgetLimits, input.clock);
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
  const executor = new ToolExecutor({
    registry: tools,
    permissions: {
      policyHash: input.pins.permissionPolicyHash,
      allowedToolIds,
    },
    budget,
    artifacts,
    context: { workspace, processRunner },
    clock: input.clock,
  });
  const memory = new FilesystemMemory(
    path.join(root, "memory"),
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
  });
  const loop = new AgentExecutionLoop({
    configuration: {
      sessionId: input.sessionId,
      pins: input.pins,
      modelIdentity: input.modelIdentity,
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
    run(task, abortSignal) {
      return loop.run(task, abortSignal);
    },
  };
}
